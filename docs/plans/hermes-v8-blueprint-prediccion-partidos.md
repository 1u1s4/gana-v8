# Blueprint técnico — V8 centrado en Hermes para predicción diaria de partidos

## 1. Objetivo del sistema

Diseñar una arquitectura V8 donde Hermes actúe como orquestador multiagente de extremo a extremo para:

- recibir pedidos operativos o analíticos,
- ejecutar extracciones diarias por API y web research,
- consolidar datos en una base transaccional + analítica,
- producir predicciones por partido,
- validar ex post los resultados,
- construir parlays bajo reglas de riesgo,
- auditar decisiones, entradas y salidas,
- aislar un Hermes sandbox para pruebas del ecosistema sin contaminar producción.

La meta no es sólo “predecir”, sino operar un pipeline repetible, trazable, evaluable y seguro.

## 2. Principios de diseño

1. Hermes como control plane, no como único ejecutor.
2. Agentes especializados por dominio con roles y skills explícitos.
3. Separación estricta entre:
   - ingestión,
   - normalización,
   - features,
   - predicción,
   - validación,
   - publicación,
   - auditoría.
4. Todo artefacto importante debe ser versionable y auditable.
5. Ninguna predicción se publica sin evidencia mínima y score de confianza.
6. Sandbox aislado para probar prompts, skills, agentes y reglas sin tocar datos/productos productivos.
7. Arquitectura event-driven con crons diarios y re-ejecuciones idempotentes.
8. Contratos de datos estables entre capas para evitar acoplamiento entre agentes.

## 3. Vista macro de arquitectura

La V8 se organiza en 7 capas:

1. Experience Layer
   - Canales donde entra la demanda: Telegram, CLI, panel interno, webhook.
   - Hermes recibe solicitudes humanas o disparadores automáticos.

2. Orchestration Layer
   - Hermes Supervisor.
   - Router de tareas.
   - Scheduler/Cron manager.
   - Policy engine.
   - Gestor de subagentes.

3. Agent Execution Layer
   - Subagentes especializados con skills y toolsets delimitados.
   - Ejecución paralela cuando sea posible.
   - Subagentes sandbox o productivos según contexto.

4. Data & Knowledge Layer
   - Base operacional.
   - Data lake/raw store.
   - Feature store.
   - Catálogo de fuentes.
   - Memoria operativa/auditoría.

5. Intelligence Layer
   - Motor de predicción.
   - Ensamble de modelos/reglas.
   - Scoring de confianza.
   - Constructor de parlays.
   - Evaluador posterior.

6. Governance Layer
   - Auditoría.
   - Observabilidad.
   - Trazabilidad de prompts, tools, datasets y outputs.
   - Controles de riesgo y aprobación.

7. Environment Isolation Layer
   - Producción.
   - Staging.
   - Hermes sandbox por experimento.
   - Datos, memoria y credenciales segregadas.

## 4. Módulos principales

### 4.1 Hermes Supervisor Core

Responsabilidad:
- punto único de entrada del sistema,
- interpretar solicitudes,
- decidir si dispara flujo manual, programado o correctivo,
- delegar trabajo a subagentes,
- consolidar respuestas finales.

Capacidades:
- intake de tareas,
- descomposición del objetivo en subtareas,
- asignación por rol/skill,
- control de estado del workflow,
- manejo de timeouts, retries y fallback,
- resumen ejecutivo final.

Inputs:
- comando humano,
- evento de cron,
- alerta de validación,
- evento de disponibilidad de datos.

Outputs:
- plan de ejecución,
- órdenes para subagentes,
- estado agregado del workflow,
- decisión final publicable.

### 4.2 Task Router & Policy Engine

Responsabilidad:
- clasificar tareas por tipo,
- seleccionar agentes habilitados,
- aplicar políticas de seguridad, costo, prioridad y entorno.

Políticas sugeridas:
- research web sólo si API coverage es insuficiente,
- parlays sólo con mercados habilitados,
- predicciones productivas sólo con datasets validados,
- tareas experimentales siempre al sandbox,
- bloquear publicación si faltan mínimos de evidencia.

### 4.3 Scheduler / Cron Orchestrator

Responsabilidad:
- ejecutar pipelines diarios, intradía y post-match.

Crons base:
- T-24h/T-12h: extracción principal de fixtures, cuotas, lesiones, contexto.
- T-6h/T-2h: refresh de cuotas, alineaciones probables, noticias y señales tardías.
- T-30m: validación pre-publicación.
- Post-partido: ingestión de resultados finales.
- Nocturno: backfill, scoring histórico, recalibración, auditoría y reporting.

### 4.4 Source Connectors Module

Responsabilidad:
- conectar APIs deportivas, APIs de odds, fuentes de noticias y scraping/research web.

Submódulos:
- API Sports Connector.
- Odds Connector.
- News/Research Connector.
- Injury/Lineup Connector.
- Manual Upload Connector.

Características:
- rate limit awareness,
- retries exponenciales,
- versionado de respuestas raw,
- firma de fuente y timestamp de captura,
- deduplicación e idempotencia.

### 4.5 Normalization & Entity Resolution

Responsabilidad:
- transformar datos heterogéneos en entidades canónicas.

Entidades canónicas mínimas:
- sport,
- competition,
- season,
- team,
- player,
- match,
- market,
- bookmaker,
- lineup,
- injury report,
- odds snapshot,
- prediction artifact,
- validation artifact.

Funciones:
- mapeo de IDs cruzados entre proveedores,
- unificación de nombres,
- timezone normalization,
- detección de conflictos entre fuentes,
- scoring de confiabilidad por fuente.

### 4.6 Data Persistence Fabric

Responsabilidad:
- persistir datos según propósito.

Componentes:
1. Raw Store
   - guarda payloads completos de API/web research.
   - uso: auditoría, replay y debugging.

2. Operational DB
   - estado actual de fixtures, cuotas, predicciones y workflow.
   - ideal para consultas de producción.

3. Historical Warehouse
   - histórico para entrenamiento, backtesting y validación longitudinal.

4. Feature Store
   - features calculadas por partido/mercado/ventana temporal.

5. Audit Log Store
   - registro inmutable de decisiones, inputs, prompts, versiones y aprobaciones.

### 4.7 Feature Engineering Service

Responsabilidad:
- convertir datos crudos y normalizados en señales utilizables.

Familias de features:
- forma reciente,
- home/away splits,
- fuerza ofensiva/defensiva,
- ELO / power ratings,
- disponibilidad de jugadores,
- congestión de calendario,
- descanso,
- travel/load,
- weather/context,
- movimientos de cuota,
- consenso entre proveedores,
- volatilidad/inconsistencia de mercado,
- señales cualitativas derivadas de research.

### 4.8 Prediction Engine

Responsabilidad:
- generar probabilidad por mercado/partido.

El motor de decisión de V8 debe trabajar en tres niveles explícitos:
1. atomic prediction,
2. ranking decision,
3. parlay composition.

La predicción no termina al inferir una probabilidad. Debe transformarse en una decisión gobernada por edge, trazabilidad, correlación, riesgo, políticas de bankroll y validación posterior.

Submódulos:
- baseline model layer,
- ensemble layer,
- market calibration layer,
- confidence/risk layer,
- decision layer,
- ranking layer,
- policy/bankroll layer.

Tipos de salida:
- 1X2 / moneyline,
- total goals/points,
- both teams to score,
- handicaps/spreads,
- props simples si existen datos suficientes.

### 4.9 Validation & Post-Mortem Engine

Responsabilidad:
- comparar predicciones versus resultados reales y contra closing line / mercado.

Métricas clave:
- accuracy por mercado,
- log loss,
- Brier score,
- calibration error,
- CLV (closing line value),
- yield/ROI simulado,
- hit rate por bucket de confianza,
- performance por liga/fuente/agente/modelo.

### 4.10 Parlay Construction Engine

Responsabilidad:
- combinar picks elegibles bajo restricciones de correlación y riesgo.

El constructor de parlays no debe generar combinadas “desde cero”, sino consumir únicamente atomic predictions ya aprobadas por el decision layer.

Reglas base:
- excluir eventos altamente correlacionados,
- cap por exposición por liga/equipo,
- requerir edge mínimo por selección,
- score agregado mínimo,
- límite de legs por perfil de riesgo,
- explicar racional de inclusión/exclusión.

### 4.10.1 Decision Layer V8

Responsabilidad:
- convertir probabilidades y señales en decisiones operables y auditables.

Objetos de decisión:
- atomic prediction decision,
- ranked slate del día,
- parlay candidate,
- publication decision,
- stake recommendation.

Pipeline lógico:
1. inferencia de probabilidad,
2. calibración,
3. comparación contra mercado,
4. cálculo de edge y valor esperado,
5. scoring de confianza,
6. aplicación de reglas de negocio,
7. ranking relativo contra otras opciones,
8. chequeo de correlación/exposición,
9. asignación de stake/política,
10. emisión de explicación estructurada,
11. registro para evaluación posterior.

Principios:
- toda decisión se emite con status explícito: publish, hold, discard, review.
- ranking y stake son derivados de política, no sólo del modelo.
- el motor debe poder recomputar una decisión histórica con el mismo snapshot.
- cada rechazo debe guardar causal exacta y regla responsable.

### 4.11 Audit, Explainability & Compliance Module

Responsabilidad:
- dejar trazabilidad de cómo se llegó a cada pick o parlay.

Debe guardar:
- fuentes consultadas,
- snapshots de datos usados,
- versión de prompts/skills/modelos,
- agentes intervinientes,
- score y rationale,
- alertas de inconsistencia,
- cambios entre versión preliminar y final.

### 4.12 Sandbox Environment Manager

Responsabilidad:
- levantar un Hermes aislado para pruebas de ecosistema.

Aislamientos obligatorios:
- memoria separada,
- base de datos separada,
- credenciales mock o acotadas,
- storage raw separado,
- topic/cola/event bus separado,
- logs separados,
- feature flags experimentales.

Usos:
- probar nuevos skills,
- evaluar prompts de research,
- testear scoring rules,
- ejecutar backtests sin tocar producción,
- correr “shadow predictions”.

## 5. Diseño de agentes y roles

La V8 propone una topología multiagente con Hermes como supervisor y especialistas desacoplados.

### 5.1 Hermes Supervisor

Rol:
- coordinador maestro.

Skills:
- task decomposition,
- policy enforcement,
- workflow state management,
- cross-agent synthesis,
- exception handling.

Nunca debería:
- hacer research profundo él mismo si puede delegarlo,
- tocar directamente la DB salvo para lecturas de control o escritura de estado agregado.

### 5.2 Ingestion Agent

Rol:
- recolectar datos estructurados de APIs.

Skills:
- API calling,
- schema validation,
- retry/rate-limit handling,
- raw payload archival.

Inputs:
- ventana temporal,
- deportes/ligas objetivo,
- fuente objetivo.

Outputs:
- batches raw + estado de extracción.

### 5.3 Web Research Agent

Rol:
- enriquecer señales con contexto no estructurado.

Skills:
- web search,
- source ranking,
- extraction/summarization,
- contradiction detection,
- citation packing.

Outputs:
- hallazgos citados por partido,
- score de confianza de research,
- flags de noticias críticas.

### 5.4 Data Steward / DB Agent

Rol:
- custodiar integridad de datos y contratos de persistencia.

Skills:
- normalization checks,
- entity resolution,
- DB upserts,
- data quality checks,
- lineage registration.

### 5.5 Feature Agent

Rol:
- generar y versionar features.

Skills:
- feature computation,
- consistency checks,
- windowing,
- freshness validation.

### 5.6 Prediction Agent

Rol:
- ejecutar los modelos o heurísticas de predicción.

Skills:
- model selection,
- inference,
- calibration,
- uncertainty scoring,
- fallback to baseline.

### 5.7 Market Intelligence Agent

Rol:
- leer comportamiento de cuotas y mercado.

Skills:
- odds movement analysis,
- bookmaker divergence detection,
- line consensus,
- sharp/public signal heuristics.

### 5.8 Validator Agent

Rol:
- validar consistencia previa y posterior.

Skills:
- pre-publish validation,
- post-match scoring,
- anomaly detection,
- benchmark against market close.

### 5.9 Parlay Agent

Rol:
- armar combinadas elegibles.

Skills:
- dependency filtering,
- exposure control,
- parlay scoring,
- rationale generation.

### 5.10 Audit Agent

Rol:
- revisar trazabilidad y cumplimiento de políticas.

Skills:
- lineage checks,
- artifact completeness,
- reproducibility review,
- sandbox-vs-prod drift checks.

### 5.11 Sandbox Hermes

Rol:
- clonar el comportamiento del ecosistema en entorno aislado.

Skills:
- test execution,
- synthetic data runs,
- shadow orchestration,
- comparative reporting.

## 6. Contratos entre capas

La clave de V8 es que los agentes no se integren “por prompt”, sino por contratos formales.

### 6.1 Contrato TaskEnvelope

Representa cualquier orden de trabajo.

Campos mínimos:
- task_id,
- parent_task_id,
- workflow_id,
- task_type,
- priority,
- environment,
- requester,
- target_scope,
- payload,
- required_skills,
- due_at,
- idempotency_key,
- correlation_id.

### 6.2 Contrato AgentAssignment

Define qué agente toma una tarea.

Campos:
- assignment_id,
- task_id,
- agent_role,
- skill_bundle,
- tool_access_profile,
- input_refs,
- output_contract,
- timeout_policy,
- retry_policy.

### 6.3 Contrato SourceIngestionBatch

Salida estándar de extracción.

Campos:
- batch_id,
- source_name,
- source_endpoint,
- extraction_time,
- coverage_window,
- raw_object_refs,
- checksum,
- extraction_status,
- warnings,
- source_quality_score.

### 6.4 Contrato CanonicalMatchSnapshot

Vista consolidada por partido.

Campos:
- match_id,
- competition_id,
- scheduled_at,
- home_team_id,
- away_team_id,
- context_version,
- lineup_status,
- injury_summary,
- odds_snapshot_refs,
- research_summary_ref,
- feature_vector_ref,
- freshness_score,
- completeness_score.

### 6.5 Contrato PredictionArtifact

Artefacto estándar de predicción.

Campos:
- prediction_id,
- prediction_family = atomic,
- match_id,
- market_id,
- market_type,
- selection,
- selection_label,
- probability,
- calibrated_probability,
- confidence_interval,
- implied_edge,
- expected_value,
- fair_odds,
- offered_odds,
- odds_source,
- odds_timestamp,
- confidence_score,
- risk_score,
- rank_score,
- decision_status,
- rejection_reasons,
- eligibility_flags,
- model_version,
- feature_set_version,
- decision_ruleset_version,
- policy_version,
- rationale_ref,
- explanation_ref,
- evidence_refs,
- input_snapshot_ref,
- market_snapshot_ref,
- generated_at,
- expires_at,
- status.

Reglas:
- PredictionArtifact representa una unidad atómica publicable o descartable.
- No debe mezclar múltiples selecciones ni múltiples mercados.
- Debe versionarse ante cualquier cambio material en odds, lineup, lesión o features críticas.

### 6.6 Contrato RankedPredictionBoard

Tabla ordenada de atomic predictions elegibles para publicación o consumo por parlays.

Campos:
- board_id,
- run_id,
- board_scope,
- board_date,
- ranking_method_version,
- entries,
- generated_at,
- status.

Cada entry debe incluir:
- prediction_id,
- rank_position,
- rank_score,
- expected_value,
- confidence_score,
- risk_score,
- exposure_tags,
- parlay_eligible,
- publication_priority.

### 6.7 Contrato DecisionExplanationArtifact

Explicación estructurada para humanos y auditoría.

Campos:
- explanation_id,
- target_entity_type,
- target_entity_id,
- summary,
- thesis,
- supporting_factors,
- opposing_factors,
- uncertainty_factors,
- rule_results,
- decision_reason,
- data_gaps,
- citations,
- generated_at.

Formato recomendado:
- qué se predice,
- por qué hay edge,
- qué podría invalidarlo,
- qué reglas pasaron/no pasaron,
- por qué se publica o se rechaza.

### 6.8 Contrato ValidationArtifact

Resultado de validación ex ante o ex post.

Campos:
- validation_id,
- target_artifact_id,
- validation_phase,
- validation_ruleset_version,
- pass_fail,
- issues,
- metrics,
- benchmark_metrics,
- outcome_ref,
- closing_line_ref,
- evaluation_window,
- calibration_bucket,
- reviewer_agent,
- validated_at.

### 6.9 Contrato ParlayArtifact

Campos:
- parlay_id,
- parlay_family,
- leg_prediction_ids,
- leg_count,
- correlation_score,
- correlation_matrix_ref,
- exposure_score,
- combined_probability,
- joint_probability_method,
- offered_parlay_odds,
- fair_parlay_odds,
- expected_value,
- expected_log_growth,
- risk_tier,
- stake_plan_ref,
- rationale_ref,
- explanation_ref,
- constraints_applied,
- inclusion_reasons,
- exclusion_candidates,
- policy_version,
- status.

Reglas:
- Cada leg debe referenciar un PredictionArtifact con decision_status = publish.
- El parlay debe guardar el método usado para ajustar la probabilidad conjunta por correlación.
- Debe existir trazabilidad de por qué otras legs elegibles quedaron afuera.

### 6.10 Contrato BankrollPolicy

Contrato normativo para stake y límites.

Campos:
- policy_id,
- bankroll_profile,
- base_unit,
- atomic_stake_method,
- parlay_stake_method,
- max_daily_exposure,
- max_event_exposure,
- max_league_exposure,
- max_correlated_exposure,
- kelly_fraction_cap,
- loss_streak_dampener,
- confidence_scaling_rules,
- risk_tier_rules,
- stop_conditions,
- effective_from,
- version.

### 6.11 Contrato StakeRecommendation

Campos:
- stake_id,
- target_entity_type,
- target_entity_id,
- bankroll_policy_id,
- recommended_units,
- recommended_fraction,
- max_allowed_units,
- sizing_method,
- sizing_inputs,
- capped_by_policy,
- generated_at.

### 6.12 Contrato EvaluationArtifact

Resultado posterior específico para atomic pick, ranking board o parlay.

Campos:
- evaluation_id,
- target_entity_type,
- target_entity_id,
- evaluation_type,
- outcome_status,
- pnl_units,
- clv,
- brier_component,
- log_loss_component,
- calibration_bucket,
- realized_rank_percentile,
- hindsight_notes,
- generated_at.

### 6.13 Contrato AuditRecord

Campos:
- audit_id,
- entity_type,
- entity_id,
- event_type,
- actor_type,
- actor_id,
- timestamp,
- input_refs,
- output_refs,
- policy_refs,
- diff_summary,
- reproducibility_hash.

## 7. Modelo de datos conceptual

### 7.1 Entidades maestras
- Sport
- Competition
- Season
- Team
- Player
- Venue
- Bookmaker
- MarketType
- Source
- AgentProfile
- SkillBundle
- ModelRegistryEntry

### 7.2 Entidades operativas
- Match
- MatchParticipantState
- InjuryStatus
- LineupProjection
- OddsSnapshot
- NewsSignal
- ResearchFinding
- FeatureSet
- Prediction
- PredictionVersion
- RankedPredictionBoard
- DecisionExplanation
- ValidationRun
- StakeRecommendation
- Parlay
- WorkflowRun
- TaskRun
- Alert
- AuditEvent

### 7.3 Entidades analíticas
- ResultFact
- ClosingLineFact
- PerformanceMetricDaily
- PerformanceMetricByLeague
- CalibrationBucket
- DriftReport
- SourceReliabilityScore
- AgentReliabilityScore

## 8. Flujo end-to-end

### Fase A — Setup y planificación diaria
1. Cron diario dispara a Hermes Supervisor.
2. Hermes crea un WorkflowRun “daily-match-prediction”.
3. Router divide subtareas por deporte/liga/ventana.
4. Se asignan Ingestion Agent, Web Research Agent y DB Agent.

### Fase B — Ingestión
5. Ingestion Agent consume APIs de fixtures, estadísticas, odds y disponibilidad.
6. Se almacenan payloads en Raw Store.
7. DB Agent normaliza entidades y publica CanonicalMatchSnapshot preliminar.
8. Si la cobertura es insuficiente, se emite tarea al Web Research Agent.

### Fase C — Enriquecimiento
9. Web Research Agent releva noticias, lesiones, rotaciones, clima o contexto táctico.
10. Los hallazgos se guardan como ResearchFinding con citas y score.
11. DB Agent integra findings al snapshot canónico.

### Fase D — Feature generation
12. Feature Agent calcula features por partido y mercado.
13. Feature Store registra feature_set_version y freshness.
14. Validator Agent corre controles de completitud/frescura.

### Fase E — Predicción
15. Prediction Agent ejecuta modelos base y ensemble.
16. Market Intelligence Agent cruza cuotas disponibles e identifica edge.
17. Se generan PredictionArtifact(s) por mercado.
18. Si confidence_score o completeness_score son bajos, la predicción queda en “hold”.

### Fase F — Validación previa
19. Validator Agent corre reglas pre-publicación.
20. Audit Agent verifica trazabilidad mínima.
21. Hermes Supervisor decide:
   - publish,
   - hold,
   - request-refresh,
   - discard.

### Fase G — Parlays
22. Parlay Agent recibe sólo picks aprobados.
23. Aplica reglas de correlación, riesgo y edge mínimo.
24. Genera ParlayArtifact(s) con explicación y tier de riesgo.
25. Hermes decide si publica picks simples, parlays o ambos.

### Fase H — Distribución
26. Experience Layer publica reporte diario a canal/sistema destino.
27. Se adjunta resumen ejecutivo + enlaces a evidencia/auditoría interna.
28. Se registra versión exacta de lo publicado.

### Fase I — Validación posterior
29. Post-match cron ingiere resultados finales y closing lines.
30. Validator Agent compara predicciones vs resultados/mercado.
31. Se actualizan métricas por agente, modelo, liga y fuente.
32. Audit Agent genera post-mortem y drift report.
33. Hermes puede disparar tareas correctivas o recalibración.

## 9. Orquestación de workflows sugerida

### Workflow 1: Daily Prediction Run
Objetivo:
- producir picks del día.

SLA sugerido:
- completado antes de una hora fija por zona/liga.

### Workflow 2: Intraday Refresh
Objetivo:
- revalidar picks ante cambios de cuotas, alineaciones o noticias.

Reglas:
- invalidar pick si cambia una feature crítica,
- versionar predicción, no sobrescribir sin trazabilidad.

### Workflow 3: Post-Match Validation
Objetivo:
- evaluar desempeño y cerrar el ciclo.

### Workflow 4: Historical Rebuild / Backfill
Objetivo:
- recomputar features y predicciones históricas bajo nuevos modelos/reglas.

### Workflow 5: Sandbox Shadow Run
Objetivo:
- correr el mismo pipeline en Hermes sandbox para comparar contra producción.

## 10. Reglas de decisión recomendadas

### 10.1 Atomic prediction decision

Secuencia mínima:
1. tomar un CanonicalMatchSnapshot congelado,
2. generar probability y calibrated_probability,
3. leer offered_odds y convertirlas a probabilidad implícita,
4. calcular implied_edge y expected_value,
5. derivar confidence_score y risk_score,
6. aplicar reglas de elegibilidad,
7. emitir decision_status,
8. persistir explicación y stake recomendado.

Reglas de negocio:
- una predicción atómica corresponde a una sola selección y un solo mercado,
- si faltan datos críticos, el status debe ser hold y no discard silencioso,
- si el edge es positivo pero confidence_score es bajo, priorizar hold/review,
- si odds_timestamp está vencido, invalidar la publicación,
- si el mercado cambia materially entre generación y publicación, crear nueva versión.

### 10.2 Ranking de picks

Objetivo:
- ordenar picks para publicación, staking y consumo por el motor de parlays.

Reglas de ranking:
- rank_score debe combinar edge, confidence, liquidez/cobertura, riesgo y frescura,
- dos picks con edge similar deben desempatarse por menor riesgo y mejor trazabilidad,
- picks con alta incertidumbre nunca deben quedar arriba sólo por payout alto,
- el ranking debe ser reproducible con una ranking_method_version fija,
- el board debe permitir cortes por deporte, liga, mercado y ventana temporal.

Salidas mínimas:
- top picks publicables,
- picks elegibles sólo para parlay,
- picks en observación,
- picks descartados con causal.

### 10.3 Correlación y exposición

La correlación debe medirse al menos en tres planos:
1. intra-match: legs del mismo partido,
2. latent domain: mismo equipo, liga, estilo o factor contextual compartido,
3. market coupling: mercados dependientes de la misma variable subyacente.

Reglas de negocio:
- prohibir por defecto combinaciones del mismo partido salvo whitelists explícitas,
- penalizar legs que dependan del mismo shock informacional, por ejemplo lesión clave o clima extremo,
- limitar exposición acumulada por equipo, liga, bookmaker y franja horaria,
- guardar correlation_matrix_ref para toda propuesta de parlay con más de dos legs,
- si no puede estimarse la correlación, aplicar postura conservadora y bajar elegibilidad.

### 10.4 Riesgo y tiers

Definir risk_tier al menos en: conservative, balanced, aggressive.

Variables sugeridas para risk_score:
- varianza histórica del mercado,
- dispersión entre casas,
- sensibilidad a lineup/news,
- amplitud del confidence_interval,
- calidad/frescura de datos,
- volatilidad reciente de odds.

Reglas:
- atomic picks aggressive no deben alimentar parlays conservative,
- un parlay hereda como mínimo el peor risk_tier de sus legs,
- si la exposición del día supera umbrales, degradar automáticamente stakes y publication_priority,
- un pick con demasiados factores de incertidumbre debe marcarse como review aunque el edge sea alto.

### 10.5 Bankroll y policies

Principio:
- el modelo propone valor; la policy decide cuánto arriesgar y si se publica.

Políticas mínimas:
- perfiles de bankroll separados para simples y parlays,
- sizing por unidades con cap absoluto y relativo,
- Kelly fraccional opcional pero siempre capado,
- reducción de stake en rachas negativas o drift detectado,
- límites diarios, por evento, por liga y por grupo correlacionado,
- stop conditions ante anomalías operativas o caída de confiabilidad.

Reglas sugeridas:
- stake de parlay siempre inferior al stake máximo equivalente de picks simples,
- si un pick depende de research débil o una sola fuente, reducir sizing,
- si una selección es apta para simple pero marginal para parlay, permitir publish simple y bloquear parlay_eligible,
- no permitir escalado manual sin AuditRecord y override_reason.

### 10.6 Explicación estructurada

Toda decisión debe producir una explicación canónica reutilizable para:
- publicación,
- auditoría,
- soporte interno,
- post-mortem.

La explicación debe responder cinco preguntas:
1. qué se recomienda,
2. por qué existe edge,
3. qué evidencia lo sostiene,
4. qué riesgos o contraargumentos existen,
5. qué regla decidió publicarlo, retenerlo o descartarlo.

### 10.7 Evaluación posterior

Se deben evaluar tres niveles por separado:
1. calidad probabilística de atomic predictions,
2. calidad de ranking,
3. calidad de construcción de parlays y staking.

Métricas mínimas por nivel:
- atomic: Brier, log loss, calibration, CLV, ROI simulado,
- ranking: hit rate por decil, uplift top-N, realized_rank_percentile,
- parlay: ROI, drawdown, correlación real vs estimada, survival por tier,
- stake policy: crecimiento de banca, volatilidad, max drawdown, cumplimiento de caps.

Reglas:
- evaluar contra resultado final y contra mercado de cierre,
- segmentar por liga, mercado, tier de riesgo, fuente y versión de policy,
- registrar hindsight_notes sin sobreescribir la decisión original,
- disparar recalibración o downgrade de policy cuando se rompen umbrales persistentes.

### Gate de publicación de pick
Publicar sólo si:
- snapshot completeness >= umbral,
- freshness >= umbral,
- confidence_score >= umbral,
- edge estimado >= umbral,
- validación previa = pass,
- audit completeness = ok.

### Gate de parlay
Permitir sólo si:
- todas las legs están aprobadas,
- correlación agregada <= umbral,
- expected value >= umbral,
- riesgo total dentro del tier permitido.

### Gate de refresh
Forzar refresh si:
- odds movement brusco,
- alineación confirmada contradice proyección,
- lesión/noticia crítica nueva,
- inconsistencia entre fuentes clave,
- modelo drift detectado.

## 11. Observabilidad y auditoría

### Logs y métricas mínimas
- workflow latency,
- task latency por agente,
- tasa de retries por fuente,
- cobertura por liga,
- freshness lag,
- accuracy/log loss/Brier,
- ROI y CLV simulados,
- tasa de picks en hold,
- discrepancias entre sandbox y producción.

### Trazas mínimas
Cada predicción debe poder reconstruirse con:
- snapshot de entrada,
- features exactas,
- modelo y versión,
- odds usadas,
- findings de research,
- agente que aprobó,
- reglas de validación aplicadas.

## 12. Sandbox aislado: blueprint operativo

### Objetivo
Poder levantar un Hermes de prueba que replique el ecosistema sin contaminar:
- memoria,
- datos,
- credenciales,
- auditoría,
- publicación.

### Diseño
- profile independiente de Hermes,
- config independiente,
- DB/schema independiente,
- colas/eventos independientes,
- storage namespace independiente,
- feature flags experimentales,
- publicación deshabilitada o redirigida a canal de test.

### Modos de prueba
1. Unit sandbox
   - prueba un agente/skill/contrato.
2. Workflow sandbox
   - prueba pipeline completo con datos de replay.
3. Shadow sandbox
   - corre en paralelo a producción y compara outputs.
4. Stress sandbox
   - prueba picos de fixtures/fuentes/rate limits.

### Criterio de promoción sandbox -> prod
- mejora estadísticamente defendible,
- sin ruptura de contratos,
- auditoría reproducible,
- sin degradación en métricas críticas.

## 13. Riesgos y mitigaciones

1. Dependencia excesiva de una API
   - mitigación: multi-fuente + source reliability scoring.

2. Datos tardíos o contradictorios
   - mitigación: freshness score + consenso entre fuentes + refresh rules.

3. Research web alucinatorio o débil
   - mitigación: citas obligatorias + ranking de fuentes + contradiction checks.

4. Sobreajuste a una liga/mercado
   - mitigación: validación segmentada y recalibración por dominio.

5. Parlays con correlación oculta
   - mitigación: correlation rules engine y límites de exposición.

6. Falta de reproducibilidad
   - mitigación: artifact versioning + raw archival + audit records.

7. Contaminación de pruebas sobre producción
   - mitigación: sandbox con aislamiento fuerte.

## 14. Roadmap de implementación conceptual

### Fase 1 — Foundation
- Hermes Supervisor
- Scheduler
- Source Connectors
- Raw Store + Operational DB
- contratos base
- AuditRecord mínimo

### Fase 2 — Intelligence Core
- Normalization
- Feature Agent
- Prediction Agent
- Validator Agent
- dashboard interno de métricas

### Fase 3 — Research & Market Layer
- Web Research Agent
- Market Intelligence Agent
- source reliability scoring
- contradiction handling

### Fase 4 — Parlay & Governance
- Parlay Agent
- reglas de exposición/correlación
- explainability y reporting ejecutivo

### Fase 5 — Sandbox & Continuous Evaluation
- Hermes sandbox completo
- shadow runs
- drift reporting
- promoción controlada de cambios

## 15. Decisiones estructurales recomendadas

1. Mantener Hermes como orquestador y policy brain.
2. Externalizar persistencia y cómputo intensivo a servicios/módulos especializados.
3. Versionar todo artefacto de predicción y validación.
4. Tratar web research como señal secundaria pero auditable.
5. Separar claramente picks simples de construcción de parlays.
6. Hacer del post-mortem un workflow de primera clase, no un extra.
7. Operar sandbox como gemelo parcial del sistema para pruebas reales.

## 16. Resultado esperado del blueprint

Si se implementa esta V8, el sistema debería poder:
- correr diariamente sin intervención manual,
- absorber nuevas fuentes y skills sin reescribir el núcleo,
- explicar cada predicción y cada parlay,
- medir objetivamente qué funciona,
- experimentar en sandbox sin riesgo operativo,
- evolucionar a un ecosistema multiagente gobernado por contratos y evidencia.
