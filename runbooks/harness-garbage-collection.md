# Harness Garbage Collection

## Objetivo

Ejecutar patrullaje recurrente de baja friccion para reducir drift documental, rutas legacy, artifacts sin owner y decisiones sin evidencia. El runbook produce una decision explicita por hallazgo: `fix now`, `active plan` o `accepted risk`.

## Disparadores

- Cierre de un plan que toque harness, docs, runbooks, release ops o entrypoints agentic.
- PR de limpieza pequena posterior a una sesion agentic larga.
- Sospecha de drift entre `README.md`, `AGENTS.md`, `docs/README.md`, planes activos y runbooks.
- Evidencia local o artifacts usados para promotion sin ruta o owner claros.
- Referencias nuevas a runtime legacy, stubs, helpers duplicados o validaciones degradadas.

## Precondiciones

- Tener identificado el frente, owner humano o agente responsable y superficie tocada.
- Revisar [docs/harness-principios-dorados.md](../docs/harness-principios-dorados.md) para distinguir regla bloqueante, guideline y excepcion temporal.
- Si el patrullaje toca suites largas o DB-backed, aplicar primero [expensive-verification-triage.md](./expensive-verification-triage.md).
- No mezclar garbage collection con features grandes; si requiere migracion amplia, clasificar como `active plan`.

## Cadencia

| Cadencia | Alcance | Owner role | Salida esperada |
| --- | --- | --- | --- |
| Por PR docs/runbook | Revisar links, comandos canonicos, plan unico y evidencia del cambio. | Change owner. | Drift corregido en el PR o decision registrada. |
| Al cierre de plan | Confirmar que backlog, docs y runbooks cuentan la misma historia. | Plan closer. | Cierre sin fuentes activas en conflicto. |
| Semanal en frentes agentic activos | Buscar rutas legacy nuevas, artifacts sin owner y checks degradados. | Harness steward on-duty. | Lista corta de hallazgos priorizados. |
| Antes de promotion release ops | Revisar que evidencia de sandbox, runtime release y smoke Hermes sea trazable. | Release owner. | Promotion con artifacts y riesgos residuales explicitos. |

## Procedimiento

1. Declarar objetivo, alcance, baseline, validacion y criterio de done si el cambio no es trivial.
2. Leer los entrypoints relevantes: `AGENTS.md`, `README.md`, `docs/README.md`, `runbooks/README.md` y el plan activo del frente.
3. Comparar el cambio contra las reglas bloqueantes de [docs/harness-principios-dorados.md](../docs/harness-principios-dorados.md).
4. Clasificar cada hallazgo con severidad `green`, `yellow` o `red`.
5. Decidir una salida por hallazgo: `fix now`, `active plan` o `accepted risk`.
6. Aplicar solo limpiezas pequenas y revisables en el mismo PR.
7. Registrar evidencia minima y riesgos residuales en el PR, handoff o plan activo.

## Evidencia minima

Cada corrida debe dejar:

- Fecha, owner role y frente revisado.
- Archivos inspeccionados.
- Hallazgos con severidad y decision.
- Comandos baratos ejecutados, si aplica.
- Artifact paths relevantes, si existen.
- Excepciones temporales usadas, con owner, condicion de retiro y evidencia.
- Riesgos residuales y proxima accion.

Para cambios docs-only, la evidencia puede limitarse a lectura, diff y checks baratos. No ejecutar sweeps costosos solo para satisfacer este runbook.

## Decision por hallazgo

| Decision | Usar cuando | Evidencia requerida | Resultado |
| --- | --- | --- | --- |
| `fix now` | El hallazgo rompe una regla bloqueante, link local, comando canonico, discoverability critica o frontera runtime. | Archivo afectado, condicion esperada y cambio aplicado. | Se corrige en el mismo PR. |
| `active plan` | La correccion excede una limpieza pequena o requiere coordinacion con otro frente. | Link al plan activo existente o nota de plan requerido. | El PR no intenta resolver todo; deja owner y proxima accion. |
| `accepted risk` | El costo de corregir ahora supera el riesgo y no bloquea operacion ni promotion. | Owner, condicion de revision, evidencia observada y razon de aceptacion. | Riesgo explicito, revisable y no escondido. |

Reglas de escalamiento:

- Un hallazgo `red` sin excepcion temporal valida debe ser `fix now`.
- Un hallazgo `yellow` puede ser `fix now` si es mecanico, o `active plan` si necesita diseno.
- Un hallazgo `green` no requiere accion salvo que revele deuda facil de limpiar sin ampliar alcance.
- `accepted risk` nunca puede reemplazar una regla bloqueante sin owner, condicion y evidencia.

## Checklist de patrullaje

- Planes activos: no hay dos fuentes vigentes para el mismo gap.
- Entry points: `AGENTS.md`, `README.md`, `docs/README.md` y `runbooks/README.md` no se contradicen en comandos o routing.
- Runbooks: el procedimiento ejecutable vive en el runbook especifico, no duplicado en docs de contexto.
- Runtime: nuevas referencias apuntan a `packages/control-plane-runtime`, `apps/hermes-scheduler`, `apps/hermes-dispatcher` y `apps/hermes-recovery`.
- Legacy: referencias a `apps/hermes-control-plane` tienen razon temporal.
- Evidencia: artifacts usados para decision tienen ruta y owner.
- DB-backed: si hubo MySQL manual, hay prefijos/IDs y cleanup o riesgo residual.
- Checks: las validaciones degradadas tienen condicion de retorno al flujo fiel.
- Mensajes: cualquier check nuevo dice que fallo, donde fallo y que hacer despues.

## Formato de salida recomendado

```text
Harness garbage collection
Fecha:
Owner role:
Frente:
Archivos revisados:
Evidencia:

Hallazgos:
- [severity] descripcion
  Decision: fix now | active plan | accepted risk
  Owner:
  Condicion:
  Evidencia:

Riesgos residuales:
Proxima accion:
```

## Salida

- Drift bloqueante corregido o excepcion temporal documentada.
- Hallazgos mayores convertidos en plan activo cuando no caben en una limpieza pequena.
- Riesgos aceptados con owner, condicion de revision y evidencia.
