# Runbooks operativos

Este archivo es el indice canonico para descubrir procedimientos operativos. Los runbooks individuales mantienen los comandos ejecutables; este indice solo enruta por objetivo, disparador y precondicion.

## Runbooks operativos activos

- `expensive-verification-triage.md`: escalera para verificaciones largas, DB-backed o costosas.
- `harness-garbage-collection.md`: patrullaje recurrente de entropia, fronteras runtime y limpieza pequena del harness.
- `observability-traceability-incident.md`: investigacion cuando health/readiness/summary/logs no explican un incidente.
- `public-api-operator-console-read-model-staleness.md`: divergencias entre `public-api`, `operator-console` y estado durable.
- `quarantine-manual-review.md`: revision manual de tareas en cuarentena o con decision humana pendiente.
- `recovery-redrive.md`: recovery/redrive de tareas fallidas, leases vencidas o retries agotados.
- `release-review-promotion.md`: validacion de candidatos de release con runtime durable y evidencia auditable.
- `rollback.md`: retiro de un candidato cuando la evidencia de release deja de ser confiable.
- `sandbox-certification-drift.md`: drift de goldens, evidence packs o certificacion sintetica.
- `sandbox-certification.md`: certificacion deterministica de sandbox contra goldens versionadas.
- `smoke-e2e-runtime-failure.md`: diagnostico del smoke Hermes end-to-end.
- `webscraping-gambeta.md`: scraping HTML simple hacia la base aislada `webscraping_gambeta` en MySQL.
- `worktree-bootstrap-validation.md`: bootstrap aislado por worktree y validacion ejecutable HTTP/UI del harness vivo.

## Routing operativo

| Objetivo | Disparador principal | Precondicion minima | Runbook |
| --- | --- | --- | --- |
| Elegir la verificacion mas barata antes de una corrida larga | Cambios con `pnpm test`, DB-backed checks o suites que ya consumen tiempo | Conocer superficies tocadas y si `DATABASE_URL` es compartida | [`expensive-verification-triage.md`](./expensive-verification-triage.md) |
| Patrullar entropia del harness | Cierre de plan, PR docs/runbook, rutas legacy nuevas o artifacts sin owner | Contrato de principios dorados revisado y frente identificado | [`harness-garbage-collection.md`](./harness-garbage-collection.md) |
| Validar promocion o revisar `runtime-release` | Candidato a `main`, fallo de release ops o estado `review-required` | MySQL preparado con migraciones versionadas y certificacion sintetica revisada | [`release-review-promotion.md`](./release-review-promotion.md) |
| Diagnosticar certificacion sintetica | Fallo de `pnpm test:sandbox:certification` o diff contra golden | Goldens versionadas disponibles y artifact path definido | [`sandbox-certification.md`](./sandbox-certification.md) |
| Clasificar drift sintetico | Evidence pack no coincide con golden vigente | Saber si el cambio esperado es de fixture, policy o runtime real | [`sandbox-certification-drift.md`](./sandbox-certification-drift.md) |
| Resolver smoke Hermes | Falla `pnpm test:e2e:hermes-smoke` o job `e2e-smoke` | DB creada, env de smoke definido y dependencias instaladas | [`smoke-e2e-runtime-failure.md`](./smoke-e2e-runtime-failure.md) |
| Investigar recovery/redrive | Tareas `failed`, `quarantined`, leases vencidas o pressure de retries | `public-api` accesible y contexto del incidente identificado | [`recovery-redrive.md`](./recovery-redrive.md) |
| Revisar cuarentena manual | Tarea requiere decision humana o no debe redrivearse a ciegas | Tarea identificada y capability operativa disponible | [`quarantine-manual-review.md`](./quarantine-manual-review.md) |
| Investigar staleness de lectura | `public-api` y `operator-console` divergen o muestran datos viejos | Acceso al entorno afectado o replica de consulta | [`public-api-operator-console-read-model-staleness.md`](./public-api-operator-console-read-model-staleness.md) |
| Investigar incidente de observabilidad | Health/readiness/logs no explican el estado real | Ventana temporal y entorno afectados identificados | [`observability-traceability-incident.md`](./observability-traceability-incident.md) |
| Ejecutar rollback de release | Candidato aprobado pierde confiabilidad o falla evidencia critica | SHA/branch bueno identificado y owner humano de rollback | [`rollback.md`](./rollback.md) |
| Persistir resultados de scraping HTML aislado | Se necesita probar o supervisar scraping web sin mezclarlo con la DB operativa principal | Credenciales MySQL disponibles y URLs objetivo definidas | [`webscraping-gambeta.md`](./webscraping-gambeta.md) |
| Levantar y validar un harness por worktree | Trabajo agentic paralelo, bug repro local o evidencia viva de consola/API | Worktree dedicado y puertos elegidos | [`worktree-bootstrap-validation.md`](./worktree-bootstrap-validation.md) |

## Matriz canonica de bootstrap y preparacion

| Contexto | Preparacion canonica | Regla |
| --- | --- | --- |
| Bootstrap local descartable | `pnpm db:generate` + `pnpm db:push` | Solo para bases efimeras o throwaway donde no se publica evidencia de promocion. |
| Release review / promotion | `pnpm db:generate` + `pnpm db:migrate:deploy` | Es la ruta canonica para evidencia release-grade. |
| Runtime release y smoke Hermes | `pnpm db:generate` + `pnpm db:migrate:deploy` | Usar migraciones versionadas cuando la corrida respalda promocion o rollback. |
| Recovery/redrive aislado | `pnpm db:generate` + `pnpm db:migrate:deploy` | No mutar schema del entorno afectado con sincronizacion ad hoc. |
| Staleness e incidentes | Sin mutacion de schema en la DB afectada | Consultar el estado existente; para repro aislada elegir bootstrap local o release-grade segun el objetivo. |
| Rollback | `pnpm db:generate` + `pnpm db:migrate:deploy` | La validacion del rollback debe seguir la misma preparacion que release review. |

## Doc-gardening recurrente

- Frecuencia: ejecutar en cada cierre de plan que toque docs, runbooks, release ops o entrypoints de agentes.
- Owner de la corrida: quien mueve el plan o mergea el cambio a `main`.
- Evidencia minima: resultado de `node scripts/workspace-lint.mjs --repo .`, resultado de `pnpm harness:scorecard`, resultado de `pnpm lint` cuando aplique y notas de cualquier drift no corregido.
- Decision de backlog: corregir en el mismo cambio cuando el drift rompa discoverability, links, comandos canonicos o sync de planes; abrir o mantener plan activo solo si el drift requiere trabajo mayor.
- Regla de fuente unica: este archivo mantiene el inventario exhaustivo de runbooks; los entrypoints principales enlazan aqui y los runbooks individuales conservan el procedimiento ejecutable.
