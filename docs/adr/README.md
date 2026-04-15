# ADR index — gana-v8

Este directorio registra decisiones arquitectónicas activas para el bootstrap de gana-v8.

## Convención

- Estado inicial usado en este repo: `Accepted`.
- Cada ADR describe contexto, decisión, consecuencias y señales concretas del repo que justifican la decisión.
- Nuevas decisiones deben crear un archivo nuevo; evitar reescribir historial salvo correcciones editoriales o aclaraciones menores.

## ADRs iniciales

1. `ADR-001-monorepo-apps-packages-boundaries.md`
   - Define el monorepo por límites operativos: apps desplegables y packages reutilizables.
2. `ADR-002-hermes-as-control-plane.md`
   - Establece a Hermes como capa explícita de orquestación, policies y approval gates.
3. `ADR-003-domain-core-vs-adapters.md`
   - Separa dominio puro de adapters de infraestructura, persistencia y transporte.
4. `ADR-004-append-only-raw-and-canonical-boundary.md`
   - Fija ingestión raw append-only y downstream sobre batches cerrados/versionados.
5. `ADR-005-separate-parlay-engine.md`
   - Aísla parlays del scoring atómico y de la publicación.
6. `ADR-006-research-bundle-gates.md`
   - Exige quality gates antes de que research alimente scoring o publicación.
