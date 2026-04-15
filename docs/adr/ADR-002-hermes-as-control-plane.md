# ADR-002: Hermes como control plane explícito

- Status: Accepted
- Date: 2026-04-15

## Context

El master plan define a Hermes como supervisor y policy brain de gana-v8. El sistema coordina ingestión, research, scoring, validación y publicación con ritmos, costos y gates distintos. Si cada worker decide scheduling, retries, prioridad y approvals por cuenta propia, el sistema pierde trazabilidad operativa y replay consistente.

El repo ya refleja esta dirección: `apps/hermes-control-plane/src/index.ts` modela cron specs, queue, routing de intents y despacho a capacidades especializadas.

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

- `apps/hermes-control-plane/src/index.ts` usa `packages/orchestration-sdk` para scheduler, queue y routing.
- `packages/orchestration-sdk/src/index.ts` define contratos como `TaskEnvelope`, `WorkflowIntent`, `CronWorkflowSpec` y budget policies.
- El control plane actual ya coordina ingestión de fixtures y odds sin ejecutar directamente la lógica de connector bajo Hermes.

## Consequences

### Positivas

- un único punto para prioridades, budgets y approval gates;
- observabilidad operativa y auditoría más simples;
- workers más reemplazables al integrarse por contrato.

### Costos

- Hermes pasa a ser componente crítico y debe endurecerse progresivamente;
- aparecen contratos adicionales entre orquestación y ejecución que deben sostenerse en CI.
