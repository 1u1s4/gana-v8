# ADR-005: Parlay engine separado del prediction engine

- Status: Accepted
- Date: 2026-04-15

## Context

Las predicciones atómicas y el armado de parlays resuelven problemas distintos. El scoring base estima probabilidad, edge y confianza por selección individual. El armado de parlays trabaja con correlación, exposición, combinatoria y restricciones operativas de combos.

El plan maestro separa explícitamente prediction engine y parlay engine. El repo ya materializa esa intención con `packages/parlay-engine` como workspace propio.

## Decision

El armado de parlays vive en un package independiente: `packages/parlay-engine`.

### Regla de dependencia

- `prediction-engine` produce selecciones o artefactos atómicos evaluados;
- `parlay-engine` consume esos outputs y aplica reglas de combinación, correlación y riesgo;
- `publication-engine` publica el resultado final, pero no esconde lógica de combinación.

No se permite mezclar reglas de parlays dentro de `prediction-engine`, `publication-engine` o `hermes-control-plane` salvo wiring mínimo.

## Implementation alignment observed in repo

- `README.md` lista `packages/parlay-engine` como capability separada.
- `docs/plans/gana-v8-monorepo-layout.md` y el master plan distinguen atomic prediction de composición de parlays.
- El workspace `packages/parlay-engine` ya existe y tiene pruebas propias, señal de boundary intencional.

## Consequences

### Positivas

- separación nítida entre probabilidad individual y construcción de combos;
- tuning y testing independientes para picks atómicos vs parlays;
- menor riesgo de contaminar el scoring base con constraints de publicación o exposición.

### Costos

- un paso más en el pipeline;
- contratos explícitos adicionales entre scoring, parlay y publicación.
