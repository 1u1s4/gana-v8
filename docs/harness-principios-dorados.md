# Principios dorados del harness

## Objetivo

Definir las reglas que mantienen el repo como harness operable por humanos y agentes sin acumular entropia. Este documento separa reglas bloqueantes, guidelines y excepciones temporales para que futuras revisiones no conviertan preferencias vagas en gates fragiles.

## Alcance

Aplica a cambios en docs, runbooks, runtime Hermes, `sandbox-runner`, certificacion sintetica, release ops, scripts de harness y entrypoints agentic. No reemplaza ADRs, planes activos ni runbooks especificos; los enlaza como fuente de procedimiento cuando haga falta ejecutar.

## Reglas bloqueantes

Estas reglas deben bloquear merge o promotion cuando se incumplen sin excepcion temporal documentada.

| Regla | Condicion bloqueante | Evidencia minima |
| --- | --- | --- |
| Fuente durable | Una decision operativa, regla de backlog o excepcion queda solo en chat, handoff efimero o memoria humana. | Link al doc, runbook, plan, ADR o comentario versionado donde quedo la verdad durable. |
| Plan unico por gap activo | Dos documentos activos compiten por el mismo frente o `docs/plans/falta/` no coincide con los indices canonicos cuando el cambio altera backlog. | Lista de planes activos alineada en los entrypoints que correspondan al cambio. |
| Runtime canonico | Un flujo nuevo trata `apps/hermes-control-plane` como runtime primario en vez de `packages/control-plane-runtime` y las apps Hermes recomendadas. | Imports, comandos o docs apuntan a `packages/control-plane-runtime`, `apps/hermes-scheduler`, `apps/hermes-dispatcher` o `apps/hermes-recovery`. |
| Compatibilidad legacy acotada | Se agrega dependencia nueva a `apps/hermes-control-plane` sin justificar que es compatibilidad temporal para tests, imports o flujos legacy. | Excepcion temporal con owner, condicion de retiro y evidencia. |
| Evidencia antes de promotion | Un cambio de release ops, sandbox certification, runtime durable o consola operativa se promociona sin evidencia reproducible. | Artifact path, comando focalizado o resultado de validacion registrado en el PR o handoff. |
| DB compartida protegida | Se ejecuta repro DB-backed manual sin identificar si `DATABASE_URL` es compartida o aislada y sin plan de cleanup. | Nota de entorno, IDs/prefijos usados y resultado de cleanup o riesgo residual aceptado. |
| No duplicar procedimiento canonico | Un documento nuevo reimplementa comandos o pasos que ya manda un runbook canonico sin enlazarlo. | Link al runbook especifico y solo contexto diferencial en el documento nuevo. |
| Comandos canonicos sin drift | Entry points operativos publican comandos contradictorios para bootstrap, release, sandbox o checks de salida. | Comandos alineados con `README.md`, `AGENTS.md`, `runbooks/README.md` y runbook especifico. |
| Remediacion legible | Un check nuevo falla con mensaje que no permite decidir siguiente accion. | Mensaje con archivo, condicion esperada, condicion recibida y runbook o plan recomendado. |
| Artifacts trazables | Se versiona o genera evidencia sin ruta, owner o proposito reconocible. | Artifact root documentado, nombre estable y referencia desde handoff, PR o runbook. |

## Guidelines

Estas preferencias orientan revisiones y patrullaje. No deben bloquear por si solas salvo que una regla bloqueante tambien este afectada.

- Preferir cambios pequenos, revisables y con una sola razon de ser.
- Mantener docs de plan en enfoque `gap-first`: estado confirmado, ya cubierto, faltantes exclusivos, dependencias y done.
- Usar runbooks para procedimientos ejecutables y docs para contratos, mapas o decisiones.
- Favorecer checks focalizados antes de sweeps globales, especialmente en suites DB-backed o largas.
- Nombrar worktrees, artifacts y prefijos manuales con un identificador corto del frente.
- Mantener ejemplos de comandos minimos; si hay variantes, explicar cuando se elige cada una.
- Evitar stubs, helpers duplicados y rutas legacy nuevas si no hay owner y retiro previsto.
- Registrar degradaciones de validacion con condicion concreta para volver al flujo fiel.
- Separar evidencia objetiva de juicio humano: resultado observado primero, decision despues.
- Cuando un principio parezca demasiado subjetivo para bloquear, convertirlo en guideline o proponer un check mecanico antes de gatearlo.

## Excepciones temporales

Toda excepcion a una regla bloqueante debe tener owner, condicion de retiro y evidencia. No se aceptan excepciones sin fecha de revision o sin senal verificable.

| Excepcion | Owner | Condicion de retiro | Evidencia requerida | Estado |
| --- | --- | --- | --- | --- |
| `apps/hermes-control-plane` conserva imports internos y tests legacy dentro del workspace de compatibilidad. | Runtime owner del frente Hermes. | Los imports legacy y tests de compatibilidad se reemplazan por `packages/control-plane-runtime` y apps Hermes recomendadas. | Lista de imports legacy restantes o PR que reduce la superficie. | Temporal aceptada. |
| Un plan activo puede quedar sin enforcement mecanico mientras se disena el check accionable. | Owner del plan activo. | Existe check barato o se decide explicitamente que el principio queda como guideline. | Link al plan activo y criterio de done que cubre el enforcement. | Temporal aceptada. |
| Una corrida costosa puede omitirse en un cambio docs-only. | Owner del cambio. | El cambio deja de ser docs/runbook-only o toca scripts, runtime, tests, package manifests o CI. | Nota de alcance y checks baratos ejecutados, o razon para no ejecutarlos. | Temporal aceptada. |
| Un artifact local puede vivir fuera de un indice estable durante investigacion corta. | Owner de la investigacion. | La evidencia se usa para promotion, handoff largo o decision durable. | Ruta local, timestamp y decision tomada: `fix now`, `active plan` o `accepted risk`. | Temporal aceptada. |

## Scorecard de entropia

Usar este scorecard como lectura rapida antes de abrir PRs de limpieza o cuando un frente largo cambia docs/runbooks/runtime boundaries. La puntuacion no reemplaza reglas bloqueantes; solo prioriza trabajo.

| Dimension | Senal verde | Senal amarilla | Senal roja |
| --- | --- | --- | --- |
| Discoverability | Entry points y links llevan al procedimiento correcto. | Hay una ruta valida pero no esta en el lugar esperado. | Un operador no puede encontrar el runbook o plan canonico. |
| Fronteras runtime | Imports y docs apuntan al runtime recomendado. | Hay referencias legacy justificadas. | Una ruta nueva depende de runtime legacy como primario. |
| Evidencia | Comando, artifact o resultado quedan asociados al cambio. | Evidencia existe pero esta incompleta o dispersa. | Decision sin evidencia reproducible. |
| Backlog | Planes activos y cierre cuentan la misma historia. | Hay deuda menor de wording o follow-up. | Dos fuentes activas compiten por el mismo gap. |
| Cleanup | Riesgos residuales tienen owner y proxima accion. | Riesgo aceptado pero con evidencia parcial. | Drift conocido sin owner, plan ni aceptacion explicita. |

Decision recomendada por scorecard:

- Verde: seguir con el cambio normal.
- Amarillo: corregir si es barato o registrar `active plan`.
- Rojo: aplicar `fix now` salvo que exista excepcion temporal valida.

## Referencias

- [AGENTS.md](../AGENTS.md)
- [README.md](../README.md)
- [docs/README.md](./README.md)
- [docs/agentic-sprint-contract.md](./agentic-sprint-contract.md)
- [docs/agentic-evaluation-rubric.md](./agentic-evaluation-rubric.md)
- [runbooks/expensive-verification-triage.md](../runbooks/expensive-verification-triage.md)
- [runbooks/worktree-bootstrap-validation.md](../runbooks/worktree-bootstrap-validation.md)
