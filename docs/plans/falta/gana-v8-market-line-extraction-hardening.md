# Plan de hardening de extraccion de lineas de mercado - gana-v8

> **Para Hermes:** usar `subagent-driven-development` para implementar este plan antes de confiar en totals/corners en produccion.

**Goal:** evitar que el harness use numeros incorrectos como linea de totals o corners al generar y liquidar predicciones over/under.

**Architecture:** reemplazar la extraccion generica de "primer numero encontrado" por parsers especificos de mercado, con metadata estructurada de fuente de linea y fallos seguros cuando la linea sea ambigua.

**Tech Stack:** TypeScript, scoring-worker, validation-worker, prediction-engine, node:test.

---

## Estado actual confirmado

- `apps/scoring-worker/src/index.ts` tiene `extractNumberFromText()` y `extractTotalsLineFromSnapshot()`.
- El flujo actual intenta leer un numero desde label/selectionKey y luego desde `JSON.stringify(payload)`.
- Ese fallback puede agarrar ids de provider, bookmaker ids, fixture ids, odds decimales, timestamps u otros numeros ajenos a la linea.
- `Prediction.probabilities.line` ya existe y validation usa esa linea para totals/corners.
- Si la linea es incorrecta, scoring y validation pueden publicar/liquidar una prediccion con threshold falso.

## Ya cubierto

- `Prediction.probabilities.line` existe en dominio.
- Validation salta o liquida markets over/under usando linea estructurada.
- Tests actuales cubren casos felices de lineas.
- Corners push/void ya esta contemplado cuando total iguala la linea.

## Faltantes exclusivos

### 1. Parser especifico por mercado

- Crear parser para labels tipo `Over 2.5`, `Under 2.5`, `Over/Under 2.5`.
- Exigir que over y under compartan la misma linea para el mismo snapshot.
- Para corners, aceptar lineas razonables de corners y rechazar ids/odds obvios.

### 2. Metadata de fuente de linea

- Guardar o exponer si la linea vino de `selection.label`, `selection.selectionKey` o campo estructurado del payload.
- Incluir esa fuente en rationale/diagnostics para auditoria.

### 3. Fallo seguro ante ambiguedad

- No generar candidate over/under si la linea falta o es ambigua.
- Validation debe devolver reason claro: `Market line is missing or ambiguous`.
- El reporte de disponibilidad debe poder marcar mercado disponible pero no scoreable por linea ambigua.

### 4. Tests negativos

- No extraer linea de odds `1.85`.
- No extraer linea de `fixture:api-football:1388584`.
- No extraer linea de `bet id 5` o `bookmaker id 8`.
- No extraer linea de timestamps/fechas.
- No mezclar `Over 2.5` con `Under 3.5`.

## Interfaces/contratos afectados

- `apps/scoring-worker/src/index.ts`
- `apps/scoring-worker/tests/runtime.test.ts`
- `apps/validation-worker/src/index.ts`
- `apps/validation-worker/tests/runtime.test.ts`
- `packages/prediction-engine/src/index.ts` si se mueve el parser a dominio compartido
- `scripts/report-fixture-market-availability.mjs` si se reporta scoreability por linea
- `apps/public-api/src/index.ts` si se expone source de linea

## Dependencias

- Depende de odds multi-mercado ya persistidas.
- Se beneficia de payloads reales obtenidos por `gana-v8-live-multimarket-provider-validation.md`.
- No debe cambiar behavior moneyline.
- Debe mantener validation conservadora: si no hay linea confiable, no liquidar.

## Criterio de done

- Existe un parser testeado que extrae linea solo de patrones validos.
- Totals/corners-total solo generan candidates si over y under comparten una linea valida.
- Validation salta con reason claro si falta linea o si la linea es ambigua.
- Tests negativos cubren ids, odds, timestamps y labels inconsistentes.
- La prediccion o su rationale deja trazable la linea usada y su fuente.
- `pnpm --filter @gana-v8/scoring-worker test` y `pnpm --filter @gana-v8/validation-worker test` pasan.

## Fuentes consolidadas

- Codigo actual: `apps/scoring-worker/src/index.ts`, `apps/validation-worker/src/index.ts`, `packages/domain-core/src/entities/prediction.ts`.
- Observacion de review: el fallback amplio sobre JSON serializado es el mayor riesgo tecnico actual de totals/corners.
- Plan relacionado: `docs/plans/falta/gana-v8-live-multimarket-provider-validation.md`.
