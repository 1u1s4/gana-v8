# Arquitectura multiagente de research para V8 Hermes

> Estado actual: `FALTA`.
> Pendiente principal: hoy existe un research determinístico con apoyo AI opcional, pero todavía no está materializado el `ResearchBundle` multiagente con claims, fuentes, conflictos y subtareas especializadas.

## 1. Objetivo

Diseñar la capa de research de V8 Hermes para enriquecer cada fixture con señales web externas verificables, frescas y trazables, de forma que el sistema pueda:

- buscar contexto web relevante por partido,
- delegar subtareas especializadas de research,
- evaluar rumores, news, lineups y weather,
- consolidar evidencia heterogénea por fixture,
- asignar score de confiabilidad por señal y por paquete de research,
- bloquear o degradar decisiones cuando la evidencia no alcanza el umbral mínimo.

La idea central es separar claramente:

1. discovery de fuentes,
2. extracción de evidencia,
3. evaluación de confiabilidad,
4. consolidación por fixture,
5. publicación de señales utilizables por features/predicción.

## 2. Principios de diseño

1. Fixture-first: toda investigación se ancla a un fixture_id canónico.
2. Claim-first: la unidad de análisis no es el artículo sino el claim verificable.
3. Multi-source by default: ninguna señal crítica se acepta por fuente única salvo fuentes oficiales de máxima autoridad.
4. Freshness-aware: rumores, lineups y weather tienen ventanas de validez distintas.
5. Source reliability is learned: la confiabilidad de fuentes y agentes debe recalibrarse con outcomes históricos.
6. Human-auditable: cada señal debe tener citas, timestamps, extractos y rationale estructurado.
7. Safe degradation: si research falla, el fixture sigue existiendo, pero con menor coverage/confidence.
8. Domain-specific routing: no todo claim debe pasar por el mismo agente ni usar el mismo presupuesto.

## 3. Vista lógica de la capa de research

Flujo propuesto:

1. Fixture Research Trigger
   - dispara por cron, evento de nuevo fixture o refresh intradía.

2. Research Planner
   - define agenda de investigación por fixture.
   - decide qué dimensiones investigar y con qué profundidad.

3. Specialist Swarm
   - subagentes paralelos para news, rumors, lineups, injuries, weather y market-context.

4. Evidence Normalizer
   - transforma hallazgos en EvidenceItems y Claims canónicos.

5. Reliability Judge
   - scorea fuente, claim, consenso, frescura y contradicción.

6. Research Synthesizer
   - consolida un ResearchBundle por fixture.

7. Quality Gates
   - aprueba, degrada o bloquea la publicación de señales.

8. Persistence + Feedback
   - persiste artefactos y retroalimenta rankings de fuentes/agentes.

## 4. Roles y agentes

### 4.1 Hermes Research Supervisor

Responsabilidad:
- orquestar el research end-to-end por fixture,
- descomponer trabajo en subtareas,
- administrar presupuesto/timeout,
- consolidar outputs de especialistas,
- escalar contradicciones a validación.

Entradas:
- fixture_id,
- kickoff_time,
- sport/league,
- criticidad del fixture,
- coverage actual del fixture.

Salidas:
- ResearchPlan,
- assignments a subagentes,
- ResearchBundle final,
- alerts si falta evidencia mínima.

Nunca debería:
- hacer scraping profundo él mismo,
- aceptar claims críticos sin pasar por scoring y gates.

### 4.2 Research Planner Agent

Responsabilidad:
- construir el plan de investigación óptimo para ese fixture.

Skills:
- task decomposition,
- temporal planning,
- source discovery bootstrap,
- budget allocation,
- risk-based prioritization.

Reglas:
- si faltan lineups cerca de kickoff, priorizar lineup/injury/weather.
- si hay partido de alto impacto, ampliar presupuesto de news/rumors.
- si una fuente oficial existe, consultarla primero.

Output:
- lista ordenada de ResearchTasks por dimensión.

### 4.3 Source Discovery Agent

Responsabilidad:
- descubrir y rankear dominios/fuentes relevantes por deporte, liga, equipo y tipo de señal.

Skills:
- web search discovery,
- domain clustering,
- source metadata extraction,
- authority classification.

Clasificación sugerida de fuentes:
- Tier A: oficiales (club, liga, federación, meteorología oficial).
- Tier B: periodistas/medios top históricamente confiables.
- Tier C: agregadores y prensa generalista.
- Tier D: social/foros/cuentas no verificadas.

Output:
- SourceCandidates con score base y justificación.

### 4.4 News Intelligence Agent

Responsabilidad:
- detectar noticias relevantes para el fixture.

Cobertura:
- lesiones,
- sanciones,
- descansos,
- conflictos internos,
- rotaciones,
- cambios de DT,
- contexto competitivo.

Skills:
- article retrieval,
- relevance filtering,
- named-entity extraction,
- claim extraction,
- temporal relevance scoring.

Output:
- claims de noticia con severidad e impacto estimado.

### 4.5 Rumor Verification Agent

Responsabilidad:
- procesar rumores y separar ruido de información accionable.

Skills:
- rumor detection,
- source-chain tracing,
- corroboration search,
- contradiction mapping,
- confidence downgrading.

Reglas:
- un rumor nunca entra como hecho.
- se publica como signal_type=rumor sólo si supera umbral de corroboración.
- si contradice fuente oficial reciente, su peso debe colapsar.

Output:
- RumorClaims con estado: unverified, weakly_supported, corroborated, refuted.

### 4.6 Lineup & Availability Agent

Responsabilidad:
- estimar disponibilidad y alineaciones probables/confirmadas.

Cobertura:
- probable lineup,
- confirmed lineup,
- probable bench usage,
- injuries,
- suspensions,
- minute restrictions.

Skills:
- lineup parsing,
- player identity resolution,
- last-minute update detection,
- official-vs-unofficial reconciliation.

Jerarquía de evidencia:
1. lineup oficial confirmada,
2. parte oficial del club/liga,
3. periodista beat confiable,
4. predictor de alineaciones/agregador,
5. rumor social.

Output:
- player availability matrix,
- lineup confidence,
- delta vs expectation.

### 4.7 Weather & Venue Agent

Responsabilidad:
- enriquecer el fixture con contexto meteorológico y de venue.

Cobertura:
- lluvia,
- viento,
- temperatura,
- humedad,
- sensación térmica,
- riesgo de suspensión,
- estado del campo si hay fuente disponible.

Skills:
- geocoding de venue,
- forecast retrieval,
- kickoff-time interpolation,
- severe weather heuristics.

Output:
- WeatherSignal con impacto esperado por deporte/mercado.

### 4.8 Market Context Agent

Responsabilidad:
- capturar si el research externo coincide o diverge con movimientos del mercado.

Skills:
- odds/news alignment,
- steam move detection,
- timing correlation.

Uso:
- no define verdad, pero ayuda a detectar señales tardías o ruido.

Output:
- market corroboration flags.

### 4.9 Evidence Normalizer Agent

Responsabilidad:
- convertir evidencia libre en artefactos normalizados.

Skills:
- entity resolution,
- quote extraction,
- canonical claim formation,
- deduplication,
- provenance stamping.

Output:
- EvidenceItem,
- Claim,
- SourceRecord,
- ConflictRecord.

### 4.10 Reliability Judge Agent

Responsabilidad:
- calcular confiabilidad de claim, fuente, paquete y agente.

Skills:
- source scoring,
- contradiction scoring,
- freshness weighting,
- support graph analysis,
- historical calibration lookup.

Output:
- claim_reliability_score,
- bundle_reliability_score,
- reason codes.

### 4.11 Research Synthesizer Agent

Responsabilidad:
- construir la narrativa estructurada final por fixture.

Skills:
- evidence synthesis,
- uncertainty communication,
- actionability labeling,
- citation packing.

Output:
- ResearchBundle final listo para features y UI.

### 4.12 Quality Gate / Audit Agent

Responsabilidad:
- decidir si las señales pasan a producción.

Skills:
- policy enforcement,
- completeness checks,
- freshness validation,
- contradiction review,
- audit logging.

Decisiones posibles:
- pass,
- pass_with_warnings,
- partial_publish,
- hold,
- reject.

## 5. Skill routing

### 5.1 Router por tipo de señal

Tabla conceptual:

- task_type=news_scan -> News Intelligence Agent
- task_type=rumor_check -> Rumor Verification Agent
- task_type=lineup_projection -> Lineup & Availability Agent
- task_type=weather_check -> Weather & Venue Agent
- task_type=market_crosscheck -> Market Context Agent
- task_type=source_discovery -> Source Discovery Agent
- task_type=claim_normalization -> Evidence Normalizer Agent
- task_type=reliability_scoring -> Reliability Judge Agent
- task_type=fixture_synthesis -> Research Synthesizer Agent
- task_type=quality_gate -> Quality Gate Agent

### 5.2 Router por criticidad temporal

- T-24h a T-12h:
  - foco en news de contexto, lesiones, travel, descanso y weather preliminar.

- T-6h a T-2h:
  - foco en lineups probables, noticias de último momento, cambios de disponibilidad.

- T-60m a T-10m:
  - foco casi exclusivo en lineups confirmadas, weather real y breaking news.

- Post kickoff:
  - congelar señales pregame y abrir sólo auditoría/postmortem.

### 5.3 Router por cobertura actual

- coverage_score < 0.4:
  - activar discovery + broad scan.

- 0.4 <= coverage_score < 0.7:
  - activar corroboration y búsqueda dirigida.

- coverage_score >= 0.7:
  - sólo refresh selectivo y control de freshness.

### 5.4 Router por tipo de fuente disponible

- si existe fuente oficial reciente -> consultar primero y usar como anchor.
- si sólo hay medios no oficiales -> exigir corroboración cruzada.
- si sólo hay social signals -> degradar a rumor salvo evidencia convergente.

## 6. Contratos de datos recomendados

### 6.1 ResearchTask

Campos mínimos:
- task_id
- fixture_id
- task_type
- signal_family
- priority
- deadline
- budget_tokens
- budget_tool_calls
- search_queries[]
- source_hints[]
- required_confidence
- freshness_sla_minutes

### 6.2 EvidenceItem

Campos mínimos:
- evidence_id
- fixture_id
- source_url
- source_domain
- source_type
- publisher
- author_handle
- published_at
- fetched_at
- locale
- raw_excerpt
- normalized_excerpt
- entities[]
- capture_hash
- provenance_chain[]

### 6.3 Claim

Campos mínimos:
- claim_id
- fixture_id
- claim_type
- subject_entity
- predicate
- object_value
- status
- effective_time
- extracted_from_evidence_ids[]
- contradiction_claim_ids[]
- impacted_markets[]
- estimated_effect_size

Ejemplos de claim_type:
- player_out
- player_doubtful
- lineup_confirmed
- coach_rotation_expected
- severe_weather_risk
- morale_issue_reported
- rumor_transfer_distraction

### 6.4 SourceRecord

Campos mínimos:
- source_domain
- source_tier
- base_authority_score
- historical_precision
- historical_recall
- sport_scope[]
- league_scope[]
- source_bias_flags[]
- last_recalibrated_at

### 6.5 ResearchBundle

Campos mínimos:
- fixture_id
- generated_at
- coverage_score
- freshness_score
- contradiction_score
- bundle_reliability_score
- critical_alerts[]
- top_claims[]
- suppressed_claims[]
- evidence_index[]
- recommended_feature_updates[]
- publication_status

## 7. Quality gates

### Gate 0: Canonical fixture resolution

Bloquea si:
- no hay fixture_id confiable,
- equipos/venue/hora no están resueltos,
- hay ambigüedad de entidad alta.

### Gate 1: Source admissibility

Pasa si:
- cada claim viene con al menos una fuente admisible,
- fuentes de Tier D no pueden sustentar claims críticos por sí solas.

### Gate 2: Freshness

Reglas sugeridas:
- lineups confirmadas: TTL 15-20 min hasta kickoff.
- rumores: TTL corto y degradación rápida.
- weather: refresh cada 30-60 min cerca del partido.
- noticias estructurales: TTL más amplio.

### Gate 3: Corroboration

Pasa si:
- claims críticos no oficiales tienen al menos 2 fuentes independientes,
- o 1 fuente oficial con timestamp reciente.

Claims críticos típicos:
- baja de estrella,
- cambio de arquero/QB/PG inicial,
- suspensión confirmada,
- clima severo,
- rotación masiva.

### Gate 4: Contradiction handling

Reglas:
- si dos fuentes de peso alto contradicen el mismo claim, publicar como uncertain o hold.
- si una oficial reciente contradice una no oficial previa, prevalece la oficial.
- contradicción no resuelta reduce bundle_reliability_score.

### Gate 5: Actionability

No todo claim debe terminar en feature.

Pasa a features sólo si:
- impacta mercados concretos,
- tiene razonable tamaño de efecto,
- supera umbral de confiabilidad.

### Gate 6: Audit completeness

Pasa si:
- existe provenance completa,
- citas guardadas,
- timestamps presentes,
- reason codes del score presentes,
- agente responsable identificado.

## 8. Scoring de confiabilidad

## 8.1 Score por fuente

Propuesta de score base de fuente en [0,1]:

source_score =
  0.35 * authority_score +
  0.20 * historical_precision +
  0.10 * beat_proximity +
  0.10 * identity_verification +
  0.10 * freshness_fit +
  0.10 * independence_score +
  0.05 * content_quality_score

Donde:
- authority_score: oficialidad/estatus editorial.
- historical_precision: acierto histórico en claims similares.
- beat_proximity: cercanía al equipo/liga.
- identity_verification: autor/cuenta verificada y consistente.
- freshness_fit: qué tan adecuada es la recencia para este claim.
- independence_score: penaliza agregadores que copian a una única fuente original.
- content_quality_score: presencia de detalles verificables vs lenguaje vago.

## 8.2 Score por claim

claim_score =
  0.30 * weighted_source_support +
  0.20 * corroboration_score +
  0.15 * freshness_score +
  0.15 * extraction_confidence +
  0.10 * temporal_relevance +
  0.10 * contradiction_penalty_inverse

Notas:
- weighted_source_support pondera fuentes independientes, no volumen bruto.
- contradiction_penalty_inverse cae fuerte con conflictos no resueltos.
- extraction_confidence mide qué tan nítido fue el claim en el texto.

## 8.3 Score del bundle por fixture

bundle_reliability_score =
  0.25 * coverage_score +
  0.25 * avg_top_claim_score +
  0.20 * critical_claims_resolved_score +
  0.15 * freshness_score +
  0.10 * source_diversity_score +
  0.05 * low_conflict_score

Interpretación sugerida:
- 0.85-1.00: alta confianza, publicable.
- 0.70-0.84: usable con warnings menores.
- 0.50-0.69: parcial, apto para features blandas pero no para claims críticos.
- <0.50: research insuficiente; degradar o retener.

## 8.4 Score de rumor

rumor_score =
  claim_score * rumor_multiplier

rumor_multiplier sugerido:
- unverified: 0.35
- weakly_supported: 0.55
- corroborated: 0.80
- refuted: 0.05

Esto evita que un rumor “parezca hecho” aunque venga de una fuente moderadamente buena.

## 8.5 Calibración histórica

Cada fuente y cada agente deberían tener métricas rolling por:
- deporte,
- liga,
- tipo de claim,
- ventana temporal antes del kickoff.

Ejemplo:
- un periodista puede ser excelente en lineups NBA T-30m pero mediocre en rumores de fichajes.

## 9. Evidencia y consolidación por fixture

Cada fixture debería tener un dossier vivo con estas secciones:

1. Snapshot del fixture
   - equipos, liga, venue, kickoff, timezone.

2. Coverage map
   - news coverage,
   - lineup coverage,
   - injury coverage,
   - weather coverage,
   - rumor coverage.

3. Claims activos
   - claims aceptados,
   - claims inciertos,
   - claims refutados.

4. Alertas críticas
   - missing starting player,
   - severe weather,
   - unresolved contradiction,
   - suspicious late market move.

5. Research summary
   - resumen ejecutivo corto,
   - top evidencias,
   - huecos pendientes.

6. Audit trail
   - agentes que intervinieron,
   - prompts/versiones,
   - timestamps,
   - fuentes.

## 10. Lógica de consolidación de señales

Reglas sugeridas:

- Confirmed lineup override:
  - una lineup oficial confirmada invalida proyecciones previas.

- Official injury override:
  - parte oficial reciente prevalece sobre noticia vieja.

- Consensus boost:
  - 3 fuentes independientes Tier B pueden acercarse al peso de una Tier A no disponible.

- Copy-chain penalty:
  - 10 artículos que citan la misma fuente original cuentan casi como 1.5, no como 10.

- Late-breaking premium:
  - señales muy cercanas al kickoff reciben más peso si son de fuente fiable, pero mayor escrutinio.

- Staleness decay:
  - el peso de un claim cae exponencialmente si expira su ventana de utilidad.

## 11. Orquestación temporal recomendada

### T-24h
- discovery inicial,
- news scan amplio,
- weather preliminar,
- baseline injuries/availability.

### T-6h
- refresh de injuries,
- lineup predictions,
- rumores relevantes,
- reconciliación con mercado.

### T-90m
- monitor intensivo de lineups,
- breaking news,
- weather near-real-time.

### T-30m a kickoff
- validar lineups oficiales,
- cerrar contradicciones,
- congelar bundle pregame.

### Post-match
- evaluar qué claims resultaron correctos,
- recalibrar fuentes/agentes,
- guardar outcome labels para aprendizaje.

## 12. KPIs recomendados

KPIs de research:
- fixture research coverage rate,
- median time-to-evidence,
- claim corroboration rate,
- unresolved contradiction rate,
- % fixtures con lineup confiable antes de kickoff,
- weather freshness compliance,
- rumor precision,
- source precision por dominio,
- agent precision por task_type,
- impacto incremental del research en performance predictiva.

## 13. Recomendación de implementación incremental

Fase 1:
- Supervisor + Planner + News Agent + Lineup Agent + Weather Agent + Synthesizer.
- scoring heurístico fijo.

Fase 2:
- Rumor Agent + Reliability Judge + Quality Gates formales.
- source registry persistente.

Fase 3:
- calibración histórica por fuente/agente,
- market crosscheck,
- aprendizaje de routing y presupuesto.

Fase 4:
- auto-discovery de nuevas fuentes,
- active learning para claims inciertos,
- simulación/sandbox de políticas de research.

## 14. Diseño recomendado final

La arquitectura recomendada para V8 Hermes es:

- Hermes Research Supervisor como control plane.
- Research Planner para decidir qué investigar y cuándo.
- Swarm de especialistas desacoplados: Source Discovery, News, Rumor, Lineup/Availability, Weather/Venue y Market Context.
- Evidence Normalizer + Reliability Judge como capa de estandarización y scoring.
- Research Synthesizer para consolidar un ResearchBundle por fixture.
- Quality Gate/Audit Agent para decidir publicación, degradación o retención.

Con este diseño, Hermes no sólo “busca en la web”: construye evidencia trazable, pondera confiabilidad, resuelve contradicciones y entrega señales listas para features y predicción con control explícito de riesgo.
