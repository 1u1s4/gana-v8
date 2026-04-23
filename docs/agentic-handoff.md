# Agentic handoff — gana-v8

Este documento define cómo dividir trabajo entre subagentes o entre sesiones sin perder ownership, contexto ni trazabilidad.

Este es el contrato minimo de relevo. Para acordar alcance, baseline, roles, validacion, reset/compaction y evaluacion antes de editar, usar tambien `docs/agentic-sprint-contract.md` y `docs/agentic-evaluation-rubric.md`.

## Cuándo usar subagentes

- Usarlos cuando el trabajo se puede partir en frentes con objetivo, archivos o contratos y verificación claramente separables.
- Usarlos cuando el frente es largo, tiene dependencias explícitas o conviene avanzar en paralelo sin mezclar cambios.
- No usarlos para cambios pequeños, secuenciales o concentrados en los mismos archivos y decisiones.
- No abrir dos subagentes sobre la misma superficie documental, contractual o de código al mismo tiempo.

## Ownership exclusivo por frente

- Cada frente tiene un solo owner activo a la vez.
- Un frente se define por objetivo, superficie tocada y criterio de verificación, no solo por carpeta.
- El owner del frente decide secuencia local, mantiene el handoff vigente y consolida el cierre o el relevo.
- Si otro subagente necesita tocar la misma superficie, primero se hace handoff o se redefine el frente; no se trabaja en paralelo sobre la misma zona.

## Artefacto mínimo de handoff

El relevo entre sesiones o subagentes debe dejar, como mínimo, este bloque:

```md
Objetivo:
Estado:
Decisiones:
Riesgos:
Próxima acción:
```

Reglas mínimas:

- El handoff debe vivir en un lugar visible para el siguiente owner, por ejemplo el plan activo, el PR del frente o el cierre de sesión.
- `Estado` debe decir qué quedó hecho y qué quedó pendiente en términos verificables.
- `Decisiones` debe registrar cambios de criterio, contratos o supuestos ya fijados.
- `Riesgos` debe nombrar bloqueos, conflictos potenciales o dependencias externas.
- `Próxima acción` debe ser la siguiente acción concreta para retomar sin reexplorar el frente.

## Aislamiento recomendado

- Si hay trabajo paralelo o de varias sesiones, preferir una rama y un worktree por frente.
- Nombrar rama y worktree por frente de trabajo, no por persona, para que el relevo sea obvio.
- No compartir un mismo worktree entre subagentes activos.
- Si no hay worktree disponible, usar aislamiento equivalente: rama dedicada, ownership explícito de archivos y serialización estricta en superficies compartidas.
- Antes de integrar o pasar el relevo, dejar el handoff mínimo actualizado y verificar el frente en su propio aislamiento.
- Para levantar y validar `public-api` + `operator-console` con puertos y artifacts aislados, usar `../runbooks/worktree-bootstrap-validation.md`.

Referencia ampliada para estrategia de worktrees y merges: `docs/plans/completado/hermes-v8-migracion-v7-a-v8-git-worktrees.md`.
