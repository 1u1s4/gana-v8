# ADR-006: Research bundle con quality gates antes de scoring y publicación

- Status: Accepted
- Date: 2026-04-15

## Context

Research agrega señales de frescura y confiabilidad heterogéneas: noticias, rumores, lineups, contexto y evidencias externas. Sin gates explícitos, claims débiles o contradictorios pueden terminar influyendo scoring o publicación como si fueran evidencia firme.

El master plan pone a research como capability de primera clase y exige quality gates antes de publicar o promover resultados. El repo ya tiene `packages/research-engine` y planes específicos que describen bundles consolidados y estados operativos.

## Decision

Todo `ResearchBundle` debe pasar gates mínimos antes de alimentar scoring, ranking o publicación.

### Gates iniciales

1. resolución canónica correcta del fixture;
2. admisibilidad de la fuente;
3. frescura según tipo de claim;
4. corroboración para claims críticos no oficiales;
5. manejo explícito de contradicciones;
6. estado consolidado del bundle: `publishable`, `degraded` o `hold`.

### Regla de consumo

- scoring consume el bundle consolidado o features derivadas, no claims sueltos;
- publicación sólo usa bundles cuyo estado y razones sean auditables;
- los claims críticos deben conservar provenance y explicación del gate aplicado.

## Consequences

### Positivas

- menor riesgo de contaminar decisiones con ruido o rumores;
- estados operativos claros para consola, auditoría y remediation;
- mejor comparabilidad entre corridas de research.

### Costos

- más fricción inicial para bundles incompletos;
- necesidad de calibrar TTLs, tiers de fuente y thresholds por deporte o mercado.
