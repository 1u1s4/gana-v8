# V8 Hermes — diseño de ETL/ELT y modelo de datos para predicción diaria de partidos

> Estado actual: `FALTA`.
> Pendiente principal: ya existen piezas de ingestión raw, canonicalización y feature snapshots, pero faltan tablas y modelos más ricos de raw/canonical que este diseño proponía como núcleo.

## 1. Alcance

Este diseño cubre únicamente la capa de datos e ingestión para V8 Hermes:

- raw landing
- canonical model
- feature store
- idempotencia
- ventanas de cron y reingestas intradía
- backfills
- rate limits y retry
- integración con APIs deportivas y fuentes complementarias

No cubre entrenamiento/model serving detallado ni UX.

## 2. Principios de diseño

1. ELT por defecto: primero persistir raw completo, luego normalizar y derivar.
2. Idempotencia fuerte por request lógico, payload y entidad de negocio.
3. Separación por capas: raw, canonical, features, serving.
4. Time-travel y replay: cualquier predicción debe poder reproducirse con snapshots de datos previos al kickoff.
5. Upserts determinísticos en canonical; append-only o snapshotado en raw y features.
6. Soporte dual para full backfill e intradía incremental.
7. Tolerancia a APIs incompletas, campos faltantes y correcciones tardías.
8. Todo registro importante debe tener lineage mínimo: source, run_id, fetched_at, effective_at, schema_version.

## 3. Stack conceptual recomendado

### 3.1 Persistencia

1. Object storage / lake
   - Uso: raw landing, respuestas JSON, HTML, CSV, archivos de replay.
   - Particionado por fecha de ingestión, fuente y recurso.

2. Warehouse analítico (Postgres grande, ClickHouse, BigQuery, Snowflake o DuckDB + lakehouse según escala)
   - Uso: canonical, snapshots históricos, training sets, backtests.

3. Feature store lógico
   - Offline store: tablas analíticas particionadas por feature_date / match_date.
   - Online store opcional: Redis/Postgres key-value para scoring intradía.

4. Catálogo y observabilidad
   - Tablas de runs, jobs, quality checks, rate-limit state, provider health.

### 3.2 Paradigma

- Raw: append-only, inmutable, versionado.
- Canonical: SCD1 para catálogos relativamente estables; snapshot/SCD2 para estados que cambian en el tiempo.
- Features: append-only por as_of_time y feature_set_version.

## 4. Dominios de fuente a cubrir

### 4.1 APIs deportivas estructuradas

1. Fixtures / schedule / results
   - Ejemplos: API-Football / API-Sports, Sportmonks, Sportradar, The Odds API para eventos base.
2. Team/player statistics
3. Standings
4. Injuries / suspensions
5. Probable lineups / confirmed lineups
6. Odds pre-match y closing
7. Weather/contexto de sede si aplica

### 4.2 Fuentes complementarias

1. News/research semiestructurado
2. Fuentes manuales o CSV curados
3. Ratings externos o power rankings

### 4.3 Contrato común por proveedor

Cada proveedor debe mapear a:

- provider_code
- endpoint_family
- source_entity_type
- rate_limit_policy
- watermark_granularity
- primary_business_keys esperadas
- freshness_sla
- trust_score base

## 5. Capas de datos

## 5.1 Raw landing

Objetivo:

Guardar exactamente lo recibido para auditoría, replay y debugging.

### Colecciones/tablas conceptuales

1. raw_ingestion_run
   - run_id
   - job_name
   - trigger_type (cron, reingest, manual, backfill)
   - provider_code
   - sport
   - league_scope
   - scheduled_for
   - started_at
   - finished_at
   - status
   - http_calls
   - records_observed
   - records_written
   - retry_count
   - watermark_from
   - watermark_to
   - error_summary

2. raw_request_log
   - request_id
   - run_id
   - provider_code
   - endpoint_family
   - request_fingerprint
   - url_template
   - request_params_json
   - requested_at
   - http_status
   - response_time_ms
   - rate_limit_remaining
   - retry_attempt
   - page_cursor
   - payload_sha256

3. raw_payload_object
   - object_uri
   - request_id
   - payload_sha256
   - payload_format
   - compressed_flag
   - fetched_at
   - source_event_time si la API lo provee
   - schema_version_detected
   - object_size_bytes
   - raw_json / raw_blob_ref

4. raw_provider_event_index
   - provider_code
   - endpoint_family
   - provider_entity_id
   - request_id
   - payload_sha256
   - observed_at
   - event_type (upsert, delete, correction, snapshot)

### Partición recomendada raw

Object path sugerido:

/raw/provider={provider_code}/entity={endpoint_family}/ingest_date={YYYY-MM-DD}/hour={HH}/run_id={run_id}/part-*.json.gz

Particiones secundarias lógicas:

- sport
- season o competition cuando agregue valor

### Idempotencia en raw

Claves:

- request_fingerprint = hash(provider_code + endpoint_family + normalized_params + scheduled_window_start + page_cursor)
- payload_sha256 = hash del body exacto
- raw_dedupe_key = request_fingerprint + payload_sha256

Reglas:

- mismo request_fingerprint con igual payload_sha256 no se reescribe, sólo se marca duplicate_seen.
- mismo request_fingerprint con distinto payload_sha256 crea nueva versión raw porque la fuente corrigió datos.
- raw nunca pisa payloads previos.

## 5.2 Canonical layer

Objetivo:

Normalizar entidades, resolver IDs cruzados y dejar tablas listas para explotación analítica y operacional.

### 5.2.1 Tablas maestras

1. dim_sport
   - sport_id
   - sport_code
   - sport_name

2. dim_competition
   - competition_id
   - sport_id
   - provider_primary_competition_key opcional
   - competition_name
   - country_name
   - tier
   - gender
   - current_status

3. dim_season
   - season_id
   - competition_id
   - season_label
   - season_start_date
   - season_end_date
   - is_current

4. dim_team
   - team_id
   - sport_id
   - canonical_team_name
   - short_name
   - country_name
   - founded_year opcional
   - active_flag

5. dim_player
   - player_id
   - sport_id
   - canonical_player_name
   - birth_date opcional
   - nationality
   - primary_position
   - active_flag

6. xref_provider_entity
   - provider_code
   - entity_type (competition, team, player, match, bookmaker, market)
   - provider_entity_id
   - canonical_entity_id
   - valid_from
   - valid_to
   - match_confidence
   - resolution_method (deterministic, fuzzy, manual)

### 5.2.2 Hechos operacionales e históricos

7. fact_match
   - match_id
   - sport_id
   - competition_id
   - season_id
   - home_team_id
   - away_team_id
   - venue_id opcional
   - scheduled_start_utc
   - kickoff_status (scheduled, live, finished, postponed, cancelled)
   - matchday
   - source_of_truth_provider
   - created_at
   - updated_at

Clave natural sugerida:
- match_nk = sport_code + competition_id + season_id + home_team_id + away_team_id + scheduled_start_utc

8. fact_match_status_snapshot
   - match_id
   - as_of_ts
   - kickoff_status
   - score_home
   - score_away
   - period_state
   - match_clock
   - status_reason
   - source_provider

PK:
- (match_id, as_of_ts, source_provider)

9. fact_team_match_stats
   - match_id
   - team_id
   - as_of_scope (pre_match, final)
   - possession
   - shots
   - shots_on_target
   - corners
   - cards
   - expected_goals si existe
   - stats_source_provider
   - stats_version_ts

PK:
- (match_id, team_id, as_of_scope, stats_source_provider, stats_version_ts)

10. fact_standings_snapshot
   - competition_id
   - season_id
   - team_id
   - as_of_date
   - rank
   - points
   - wins
   - draws
   - losses
   - goals_for
   - goals_against
   - standing_source_provider

PK:
- (competition_id, season_id, team_id, as_of_date, standing_source_provider)

11. fact_player_availability_snapshot
   - match_id
   - team_id
   - player_id
   - as_of_ts
   - availability_status (available, doubtful, injured, suspended, probable, confirmed_out)
   - reason_code
   - expected_return_date opcional
   - source_provider
   - confidence_score

PK:
- (match_id, player_id, as_of_ts, source_provider)

12. fact_lineup_snapshot
   - match_id
   - team_id
   - as_of_ts
   - lineup_status (projected, confirmed)
   - formation
   - source_provider
   - source_confidence

13. bridge_lineup_player
   - match_id
   - team_id
   - as_of_ts
   - player_id
   - lineup_role (starter, bench, unavailable)
   - position_slot

14. dim_bookmaker
   - bookmaker_id
   - bookmaker_name
   - region_code
   - active_flag

15. dim_market
   - market_id
   - sport_id
   - market_type (moneyline, 1x2, spread, total, btts, prop)
   - selection_type
   - line_value opcional
   - normalized_market_key

16. fact_odds_snapshot
   - match_id
   - bookmaker_id
   - market_id
   - selection_key
   - as_of_ts
   - decimal_odds
   - implied_prob_raw
   - line_value
   - currency opcional
   - source_provider
   - is_closing_snapshot

PK:
- (match_id, bookmaker_id, market_id, selection_key, as_of_ts, source_provider)

17. fact_news_signal
   - signal_id
   - match_id opcional
   - team_id opcional
   - player_id opcional
   - published_at
   - captured_at
   - source_domain
   - signal_type (injury_news, coaching_change, morale, weather_alert, travel_issue)
   - signal_text
   - signal_sentiment
   - extraction_confidence
   - source_url_hash

18. fact_match_result
   - match_id
   - final_home_score
   - final_away_score
   - extra_time_flag
   - penalties_flag
   - result_confirmed_at
   - source_provider

### Partición recomendada canonical

Tablas snapshot/hechos grandes:

- fact_match_status_snapshot: partition by date(as_of_ts)
- fact_odds_snapshot: partition by date(as_of_ts), cluster by match_id/bookmaker_id/market_id
- fact_player_availability_snapshot: partition by date(as_of_ts)
- fact_standings_snapshot: partition by as_of_date
- fact_news_signal: partition by date(captured_at)

Dimensiones:

- no requieren partición fuerte; sí índices por natural keys y xrefs.

### Idempotencia canonical

Regla general:

business_key + source_provider + effective_timestamp + normalized_payload_hash

Estrategias:

1. Catálogos estables
   - upsert SCD1 por canonical natural key o xref de proveedor.

2. Snapshots temporales
   - insertar sólo si cambia normalized_payload_hash.
   - si llega duplicado exacto, ignorar.

3. Correcciones tardías
   - si mismo business_key y effective_timestamp pero distinto normalized_payload_hash, insertar nueva versión con ingest_ts distinto y current_flag en view derivada.

### Vistas canonical recomendadas

1. vw_match_latest
   - último estado por partido
2. vw_odds_latest_pre_kickoff
   - última cuota pre-match por bookmaker/mercado/selección
3. vw_player_availability_latest
4. vw_lineup_latest
5. vw_match_dataset_cutoff
   - snapshot consistente por partido y cutoff específico (T-24h, T-6h, T-2h, T-30m)

## 5.3 Feature layer

Objetivo:

Materializar señales reproducibles con time-travel, separadas de raw/canonical.

### Tablas conceptuales

1. feature_run
   - feature_run_id
   - feature_set_name
   - feature_set_version
   - cutoff_label
   - as_of_ts
   - training_or_serving_mode
   - upstream_run_ids
   - status
   - created_at

2. feature_match_vector
   - feature_run_id
   - match_id
   - as_of_ts
   - feature_set_version
   - label_horizon (pre_match)
   - features_json o columnas wide
   - source_snapshot_manifest
   - feature_hash

PK:
- (feature_run_id, match_id)

3. feature_market_vector
   - feature_run_id
   - match_id
   - market_id
   - selection_key opcional
   - as_of_ts
   - feature_set_version
   - features_json o columnas wide
   - feature_hash

PK:
- (feature_run_id, match_id, market_id, coalesce(selection_key,'_base'))

4. feature_quality_report
   - feature_run_id
   - match_id
   - null_ratio
   - freshness_score
   - source_coverage_score
   - leakage_check_passed
   - issues_json

5. training_example_manifest
   - dataset_id
   - feature_set_version
   - label_definition
   - as_of_policy
   - population_filter
   - created_at
   - sql_or_manifest_ref

### Familias de features sugeridas

1. Calendario
   - days_rest_home
   - days_rest_away
   - matches_last_7d / 14d
   - travel_distance_approx

2. Rendimiento reciente
   - rolling_points
   - rolling_goal_diff
   - rolling_xg_diff
   - home_away_split_form

3. Fortaleza estructural
   - elo_pre_match
   - attack_rating
   - defense_rating
   - squad_value_proxy opcional

4. Disponibilidad
   - starters_missing_count
   - minutes_weighted_absence_score
   - confirmed_lineup_similarity_vs_typical

5. Mercado
   - opening_odds
   - latest_odds
   - odds_move_abs
   - bookmaker_dispersion
   - implied_prob_consensus
   - closing_line_gap cuando exista ex post

6. Tabla/competencia
   - ranking_gap
   - points_per_game_gap
   - relegation_or_playoff_pressure_flag

7. Contexto externo
   - weather_severity_score
   - coach_change_recent_flag
   - news_risk_score

### Partición recomendada features

- feature_match_vector partition by date(as_of_ts) o match_date
- feature_market_vector partition by date(as_of_ts)
- cluster by match_id, market_id, feature_set_version

### Idempotencia features

- feature_dedupe_key = feature_set_version + cutoff_label + match_id + market_id_nullable + as_of_ts_rounded + upstream_snapshot_hash

Reglas:
- si upstream_snapshot_hash no cambia, no recalcular.
- si cambia una fuente upstream relevante antes del cutoff, generar nueva versión de feature_run.
- nunca sobrescribir vectores ya usados en entrenamiento; sólo cerrar versión anterior y crear una nueva.

## 6. Flujos ETL/ELT

## 6.1 Flujo 1: ingestión raw incremental

1. Scheduler dispara run con ventana y ligas objetivo.
2. Connector consulta provider con watermark o rango temporal.
3. Se persiste request log y payload raw.
4. Se indexan entity_ids observados.
5. Se actualiza estado de rate limit y watermark del provider.

Input principal:
- provider + endpoint + window_start/window_end o changed_since

Output:
- raw_ingestion_run
- raw_request_log
- raw_payload_object

## 6.2 Flujo 2: normalización a canonical

1. Leer payloads raw nuevos desde último checkpoint.
2. Validar schema mínimo.
3. Mapear provider IDs a canonical IDs con xref.
4. Resolver entidades nuevas y conflictos.
5. Upsert en dimensiones.
6. Insertar snapshots o hechos.
7. Emitir quality checks y lineage.

## 6.3 Flujo 3: construcción de dataset de cutoff

1. Seleccionar partidos target con kickoff dentro de la ventana operativa.
2. Para cada cutoff, materializar vista consistente usando sólo datos con observed_at <= cutoff_ts.
3. Congelar manifest de snapshots usados.
4. Publicar dataset de features.

## 6.4 Flujo 4: refresh intradía

1. Detectar partidos con kickoff en próximas N horas.
2. Reingestar odds, lineups, injuries y noticias de alta volatilidad.
3. Recalcular sólo features afectadas.
4. Marcar superseded las versiones previas del mismo cutoff lógico si cambió upstream.

## 6.5 Flujo 5: cierre post-match

1. Ingerir resultado final y stats finales.
2. Completar fact_match_result.
3. Congelar closing odds y labels.
4. Dejar training-ready snapshots para backtesting.

## 7. Ventanas de cron sugeridas

Se asume operación diaria con reingestas intradía.

### 7.1 Cron maestro nocturno

1. 00:30 UTC
   - Sync fixtures próximos 7 días
   - standings
   - team/player baseline stats

2. 01:15 UTC
   - Normalización canonical de todo lo nuevo

3. 02:00 UTC
   - Feature backfill para partidos del día siguiente con cutoff T-24h

### 7.2 Crons intradía pre-match

Para cada partido o lote por liga:

1. T-12h
   - refresh fixtures, injuries, probable lineups, opening/latest odds

2. T-6h
   - refresh odds, injuries, news, weather

3. T-2h
   - refresh odds de mayor frecuencia, probable/confirmed lineups, news urgentes

4. T-30m
   - último snapshot pre-publicación
   - validación de freshness y completitud mínima

5. T+15m / T+2h post-match según deporte
   - resultados finales y stats finales

### 7.3 Frecuencia específica por fuente

1. Fixtures/results
   - nocturno + cada 2h intradía
2. Odds
   - cada 60m fuera de ventana crítica
   - cada 15m entre T-6h y T-2h
   - cada 5m entre T-2h y T-30m si el rate limit lo permite
3. Injuries/lineups
   - cada 2h hasta T-6h
   - cada 30m en T-6h a T-1h
   - cada 10m desde T-1h a kickoff para competencias críticas
4. Standings/team stats
   - 1 vez diaria + post-match
5. News/research
   - cada 2h o event-driven por keywords

## 8. Idempotencia end-to-end

## 8.1 Niveles de clave

1. run_id
   - UUID por ejecución física.

2. logical_job_key
   - job_name + provider_code + window_start + window_end + trigger_type + scope_hash
   - identifica la ejecución lógica; evita duplicar crons relanzados.

3. request_fingerprint
   - endpoint y parámetros normalizados.

4. raw_dedupe_key
   - request_fingerprint + payload_sha256.

5. canonical_business_key
   - clave natural de entidad o snapshot.

6. canonical_change_key
   - canonical_business_key + normalized_payload_hash + effective_ts.

7. feature_dedupe_key
   - match_id/market_id + cutoff + feature_set_version + upstream_snapshot_hash.

## 8.2 Reglas operativas

1. Reintento del mismo cron
   - reutiliza logical_job_key.
   - escribe sólo payloads o snapshots no observados.

2. Reingesta intradía
   - nuevo run_id, mismo match scope, distinto cutoff/as_of.

3. Backfill histórico
   - trigger_type=backfill, con partición de rango temporal explícita.
   - nunca mezcla métricas operativas con productivas sin una bandera environment/data_domain.

4. Corrección de proveedor
   - raw conserva ambas versiones.
   - canonical expone latest_valid_version vía vista.
   - features sólo se recomputan si la corrección cae antes del cutoff relevante.

## 9. Watermarks, checkpoints y backfills

## 9.1 Watermarks por fuente

Mantener tabla provider_watermark_state:

- provider_code
- endpoint_family
- competition_scope
- last_successful_event_time
- last_successful_page_cursor
- last_run_id
- updated_at

Uso:

- incremental por changed_since si la API lo soporta
- fallback a sliding window si no lo soporta

## 9.2 Sliding windows recomendadas

Cuando la API no da delta confiable:

1. fixtures/results
   - reconsultar [-2 días, +7 días]
2. odds
   - reconsultar partidos con kickoff en próximas 48h
3. injuries/lineups
   - reconsultar próximas 48h
4. standings/stats
   - reconsultar temporada actual completa una vez por día

## 9.3 Estrategia de backfill

Fase 1. Catálogos y xrefs
Fase 2. Fixtures/resultados históricos
Fase 3. Standings/stats
Fase 4. Odds históricas si disponibles
Fase 5. Features históricas por cutoff simulado

Buenas prácticas:

- backfill por chunks de competition + season + month
- límite de concurrencia por proveedor
- checkpoints por chunk
- reconciliación al final del chunk: counts esperados vs observados

## 10. Rate limits, retry y resiliencia

## 10.1 Tabla de políticas por proveedor

provider_rate_limit_policy
- provider_code
- endpoint_family
- requests_per_minute
- burst_limit
- daily_quota
- concurrent_requests_max
- backoff_base_ms
- backoff_max_ms
- retryable_status_codes
- retryable_error_patterns

## 10.2 Estrategia de ejecución

1. Token bucket por proveedor y opcionalmente por endpoint.
2. Cola priorizada:
   - prioridad alta: odds/lineups de partidos próximos
   - prioridad media: fixtures/results del día
   - prioridad baja: backfills
3. Retries con exponential backoff + jitter.
4. Circuit breaker si 429/5xx sostenidos.
5. Degradación elegante:
   - usar snapshot anterior si freshness aún aceptable
   - bajar frecuencia de refresh
   - reintentar tras reset window

## 10.3 Política concreta sugerida

1. 429 Too Many Requests
   - respetar Retry-After si existe
   - si no existe, backoff exponencial con jitter
   - pausar cola de ese proveedor

2. 5xx
   - hasta 5 retries
   - abrir circuit breaker por 5 minutos si error rate supera umbral

3. Timeouts/conexión
   - 3 a 5 retries
   - registrar latencia y timeout ratio

4. 4xx no transitorios
   - no retry automático salvo configuración explícita

## 10.4 Observabilidad mínima

Tablas o métricas:

- provider_call_metrics
- provider_error_metrics
- data_freshness_status
- pipeline_sla_breach
- duplicate_payload_rate
- canonical_conflict_rate
- feature_null_spike_alert

## 11. Data quality y validaciones

Checks mínimos por capa:

### Raw
- payload parseable
- schema detectado
- % respuestas vacías
- payload duplicado anómalo

### Canonical
- match_id único por natural key
- equipos válidos y distintos
- kickoff en UTC normalizado
- odds > 1.0 y line_value consistente
- lineup/availability con player-team coherente

### Features
- no leakage temporal: ninguna fuente posterior al cutoff
- rango válido por feature
- freshness mínima por familia de features
- null thresholds por feature crítica

## 12. Serving dataset para predicción diaria

Vista materializada sugerida: mart_match_prediction_snapshot

Campos:
- prediction_date
- match_id
- competition_id
- home_team_id
- away_team_id
- scheduled_start_utc
- cutoff_label
- feature_run_id
- latest_odds_snapshot_ts
- lineup_snapshot_ts
- injury_snapshot_ts
- weather_snapshot_ts
- source_coverage_score
- readiness_status (ready, degraded, blocked)
- readiness_reason

Regla:

Sólo partidos con readiness_status en ready o degraded llegan al motor de predicción. blocked queda fuera.

## 13. Recomendación de partición final entre raw / canonical / features

### Raw

Qué vive aquí:
- respuestas completas de APIs
- HTML/news raw
- logs de request/response
- índices de observación

Patrón:
- append-only
- partición por ingest_date/provider/entity
- conservación larga

### Canonical

Qué vive aquí:
- entidades normalizadas
- xrefs de proveedores
- snapshots operacionales con semantics de negocio
- resultados y odds históricas limpias

Patrón:
- upserts en dimensiones
- append/snapshot en hechos temporales
- claves naturales + surrogate IDs

### Features

Qué vive aquí:
- vectores de features por partido/mercado y cutoff
- reports de calidad de features
- manifests de datasets de entrenamiento/serving

Patrón:
- append-only por as_of_ts y feature_set_version
- reproducible y time-travel safe

## 14. Diseño mínimo viable para arrancar

Si hay que empezar simple:

Fase MVP-1
- raw_ingestion_run
- raw_request_log
- raw_payload_object
- dim_competition
- dim_season
- dim_team
- xref_provider_entity
- fact_match
- fact_odds_snapshot
- fact_match_result
- feature_match_vector
- mart_match_prediction_snapshot

Fuentes MVP:
- 1 provider de fixtures/results/stats
- 1 provider de odds
- 1 feed básico de injuries/lineups

Cutoffs MVP:
- T-24h
- T-6h
- T-2h
- T-30m

## 15. Decisiones clave recomendadas

1. Persistir raw completo siempre antes de transformar.
2. Separar snapshots temporales de entidades maestras.
3. Usar xref_provider_entity como pieza central de reconciliación.
4. Modelar odds, lineups e injuries como series temporales, no como estado único mutable.
5. Congelar features por cutoff con manifests reproducibles.
6. Usar sliding windows aunque exista watermark, porque APIs deportivas suelen corregir tarde.
7. Priorizar frescura en odds/lineups e integridad histórica en resultados/stats.
8. Mantener readiness_status para no forzar predicciones con data incompleta.
