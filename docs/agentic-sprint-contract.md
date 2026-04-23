# Contrato de sprint agentic

## Objetivo

Establecer el contrato canonico para ejecutar un sprint agentic en `gana-v8` con trabajo paralelo, ownership explicito, validacion reproducible y handoff durable en el repo.

Cada sprint debe declarar:

- Problema a cerrar y resultado observable.
- Documentos, paquetes, apps, tests o runbooks afectados.
- Rama o worktree responsable de cada frente.
- Checks obligatorios y evidencia esperada antes de pedir merge.

## Alcance

Usar este contrato cuando el trabajo toque contratos compartidos, entrypoints del repo, indices documentales, planes activos, lint estructural, verificacion costosa, handoff entre sesiones o mas de un subagente.

Para cambios pequenos, secuenciales y de una sola superficie, basta declarar objetivo, owner, validacion y criterio de cierre en el hilo o PR.

## No alcance

Este contrato no reemplaza planes activos, ADRs, runbooks ni `docs/agentic-handoff.md`.

Queda fuera de alcance:

- Cambiar el backlog sin sincronizar las fuentes canonicas del repo.
- Compartir un mismo worktree entre subagentes.
- Ejecutar verificaciones DB-backed o largas sin seguir el runbook de triage.
- Aceptar decisiones durables que vivan solo en chat.

## Roles

- Orquestador: define objetivo, divide frentes, asigna ownership, resuelve conflictos y decide merge.
- Planner: fija objetivo, alcance, baseline, riesgos y plan de validacion antes de editar.
- Implementer subagent: modifica solo los archivos bajo su ownership, deja evidencia de validacion y reporta riesgos.
- Reviewer subagent: revisa diffs, contratos, tests y documentacion afectada sin apropiarse del worktree del implementer.
- Evaluador: aplica `docs/agentic-evaluation-rubric.md` y emite `promotable`, `review-required` o `blocked`.
- Integrador: consolida cambios compartidos, resuelve drift de indices, mueve planes de estado y deja el cierre durable.

Un subagente puede cubrir mas de un rol solo si el sprint lo declara y no compromete la independencia de revision.

Un evaluador separado es obligatorio cuando el sprint modifica contratos canonicos, reglas de lint, lifecycle de planes, gates caros o mas de una superficie compartida.

## Ownership y worktree

Regla base: un worktree, una rama, un subagente.

Cada frente debe registrar:

- Rama con prefijo `codex/` salvo instruccion contraria.
- Ruta absoluta del worktree.
- Archivos o directorios permitidos.
- Archivos prohibidos o compartidos.
- Responsable de resolver conflictos antes de merge.

Ningun subagente debe revertir, reformatear o sobrescribir cambios fuera de su ownership. Si un cambio externo bloquea el trabajo, debe detenerse, describir el bloqueo y pedir decision del orquestador.

## Plan de validacion

El plan debe ser proporcional al riesgo y declarar comandos concretos antes de implementar.

Baseline de salida para cambios con impacto amplio:

```bash
pnpm lint
pnpm typecheck
pnpm test
pnpm build
pnpm test:sandbox:certification
```

Para cambios documentales acotados, la validacion minima es revisar links locales, encabezados obligatorios y consistencia con el mapa documental aplicable. Si se omite un check del baseline, el handoff debe explicar por que no era necesario o no fue posible.

Corridas largas, inestables o DB-backed deben seguir `runbooks/expensive-verification-triage.md`.

## Baseline, lift, costo y latencia

Cada sprint debe declarar un baseline simple contra el que se mide el candidate:

- Baseline: que haria un agente unico o una edicion manual minima sin este contrato.
- Lift esperado: menos drift, mejor evidencia, menor latencia de review, menos reexploracion o validacion mas fiel.
- Costo: subagentes, comandos largos, DB compartida, tiempo humano y riesgo de merge.
- Latencia aceptable: cuanto puede tardar la validacion antes de aislar una prueba mas barata.

Si el candidate no supera el baseline en claridad, verificabilidad o reduccion de riesgo, el evaluador debe marcar `review-required` o `blocked`.

## Politica de reset, compaction y continuidad

- Continuar el mismo hilo cuando el contexto sigue fresco, el diff es pequeno y no hay cambio de owner.
- Usar compaction cuando el hilo crecio pero el owner sigue igual; antes de compactar, dejar objetivo, estado, decisiones y proxima accion en un artefacto durable.
- Usar reset cuando cambia el owner, el trabajo cruza sesiones, aparece drift de contexto o el hilo ya no permite auditar decisiones.
- Ningun reset es valido sin handoff durable previo.
- Los artefactos que sobreviven a reset son repo, rama, worktree, plan activo o PR, comandos ejecutados, evidencia y handoff.

## Criterio de done

Un sprint esta done cuando:

- El objetivo declarado tiene evidencia verificable.
- Los cambios respetan ownership y no introducen documentos canonicos competidores.
- La validacion declarada fue ejecutada o justificada.
- Los riesgos abiertos tienen owner y siguiente accion.
- El handoff contiene estado, decisiones, evidencia y bloqueos.
- La rubrica de evaluacion alcanza el threshold de aprobacion definido.

## Riesgos

Riesgos que deben registrarse siempre que apliquen:

- Drift entre README, planes, runbooks y documentos canonicos.
- Checks omitidos por costo, tiempo, dependencia externa o datos locales.
- Cambios paralelos en archivos compartidos.
- Contratos publicos, migraciones o fixtures que puedan invalidar goldens.
- Incertidumbre sobre runtime recomendado o compatibilidad legacy.

Cada riesgo debe tener severidad, mitigacion y owner.

## Handoff

Todo handoff debe quedar en el repo o en el canal canonico indicado por el orquestador. Debe incluir:

- Objetivo del frente.
- Estado actual y porcentaje cualitativo: pendiente, en progreso, bloqueado o listo para review.
- Archivos cambiados.
- Decisiones tomadas.
- Validacion ejecutada con resultado.
- Riesgos abiertos y proxima accion.
- Referencias a ramas, worktrees, PRs o commits relevantes.

Si el trabajo continua en otra sesion, el handoff debe ser suficiente para que otro subagente pueda retomar sin depender de memoria humana.

## Template minimo

```md
Objetivo:
Alcance:
No alcance:
Superficies afectadas:
Owner:
Roles:
Baseline:
Candidate:
Plan de validacion:
Criterio de done:
Riesgos:
Presupuesto de costo/latencia:
Evidencia esperada:
Politica de contexto:
Ubicacion del handoff:
Trigger de evaluacion:
```
