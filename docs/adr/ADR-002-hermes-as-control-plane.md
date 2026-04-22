# ADR-002: Hermes como control plane explícito

- Status: Accepted
- Date: 2026-04-15

## Context

El master plan define a Hermes como supervisor y policy brain de gana-v8. El sistema coordina ingestión, research, scoring, validación y publicación con ritmos, costos y gates distintos. Si cada worker decide scheduling, retries, prioridad y approvals por cuenta propia, el sistema pierde trazabilidad operativa y replay consistente.

El repo reflejó inicialmente esta dirección con `apps/hermes-control-plane/src/index.ts`, que modelaba cron specs, queue, routing de intents y despacho a capacidades especializadas.

Actualización operativa 2026-04-22:

- la responsabilidad runtime se movió a `packages/control-plane-runtime`;
- la topología recomendada se reparte entre `apps/hermes-scheduler`, `apps/hermes-dispatcher` y `apps/hermes-recovery`;
- `apps/hermes-control-plane` permanece sólo como compatibilidad temporal para imports, tests y flujos legacy.

## Decision

Hermes será la capa explícita de orquestación del sistema.

### Responsabilidades de Hermes

- crear workflows desde crons, eventos y órdenes humanas;
- emitir y enrutar `TaskEnvelope` hacia workers o capacidades especializadas;
- aplicar policy, budgets, retries y approval gates;
- mantener auditabilidad de decisiones y transiciones de workflow.

### Lo que Hermes no debe absorber

- I/O pesado con proveedores externos;
- scraping o research especializado;
- scoring, construcción de parlays o settlement;
- formateo final de publicación por canal.

## Implementation alignment observed in repo

- `apps/hermes-control-plane/src/index.ts` conserva el wiring histórico como fachada de compatibilidad.
- `packages/control-plane-runtime/src/index.ts` concentra ahora la coordinación runtime reusable.
- `apps/hermes-scheduler`, `apps/hermes-dispatcher` y `apps/hermes-recovery` son los procesos recomendados para operación diaria.
- `packages/orchestration-sdk/src/index.ts` define contratos como `TaskEnvelope`, `WorkflowIntent`, `CronWorkflowSpec` y budget policies.
- El control plane histórico ya coordinaba ingestión de fixtures y odds sin ejecutar directamente la lógica de connector bajo Hermes.

## Consequences

### Positivas

- un único punto para prioridades, budgets y approval gates;
- observabilidad operativa y auditoría más simples;
- workers más reemplazables al integrarse por contrato.

### Costos

- Hermes pasa a ser componente crítico y debe endurecerse progresivamente;
- aparecen contratos adicionales entre orquestación y ejecución que deben sostenerse en CI.
