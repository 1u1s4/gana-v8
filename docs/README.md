# Docs map — gana-v8

Este directorio es el mapa canónico de documentación del repo. Su función es decir qué documento manda para cada tipo de decisión y cómo se mueve un plan entre trabajo activo, trazabilidad de cierre e histórico.

## Taxonomía mínima

- [`architecture/`](./architecture/) contiene la vista del sistema y la topología materializada. Punto de entrada recomendado: [`gana-v8-architecture.html`](./architecture/gana-v8-architecture.html).
- [`adr/`](./adr/) contiene decisiones de arquitectura aceptadas. Punto de entrada recomendado: [`adr/README.md`](./adr/README.md).
- [`plans/`](./plans/) contiene planes y propuestas de ejecución. Punto de entrada recomendado: [`plans/README.md`](./plans/README.md).
- [`plans/falta/`](./plans/falta/) contiene los planes canónicos vigentes para brechas reales del repo actual.
- [`plans/completado/`](./plans/completado/) contiene planes cuyo resultado principal ya quedó materializado de forma sustancial.
- [`plans/archivado/`](./plans/archivado/) contiene snapshots y planes históricos preservados para trazabilidad, no para trabajo activo.
- [`agentic-handoff.md`](./agentic-handoff.md) contiene el contrato operativo para subagentes, handoff entre sesiones y aislamiento por frente.
- [`../runbooks/`](../runbooks/) contiene procedimientos operativos ejecutables. Punto de entrada recomendado para corridas costosas: [`expensive-verification-triage.md`](../runbooks/expensive-verification-triage.md). Para certificación sintética, usar [`sandbox-certification.md`](../runbooks/sandbox-certification.md). Para snapshots baseline/candidate de `runtime-release`, cobertura/truncación y smoke Hermes de procesos vivos, usar [`release-review-promotion.md`](../runbooks/release-review-promotion.md) y [`smoke-e2e-runtime-failure.md`](../runbooks/smoke-e2e-runtime-failure.md).
- [`../README.md`](../README.md) sigue siendo el entrypoint general del repo para comandos, workspaces y superficies operativas.

## Regla de precedencia

- Decisión de arquitectura: manda `docs/adr/`.
- Gap activo, alcance pendiente y orden de cierre: manda `docs/plans/falta/`.
- Procedimiento operativo ejecutable: mandan los runbooks.
- Historial y contexto de decisiones ya materializadas: sirven `docs/plans/completado/` y `docs/plans/archivado/`, pero no reemplazan un plan activo.

## Lifecycle de planes

### `docs/plans/falta/`

- Debe contener solo planes activos.
- Cada frente activo debe tener un solo plan canónico; no deben convivir dos planes vigentes compitiendo por el mismo gap.
- Los planes activos deben usar enfoque `gap-first` e incluir como mínimo: `Estado actual confirmado`, `Ya cubierto`, `Faltantes exclusivos`, `Interfaces/contratos afectados`, `Dependencias`, `Criterio de done` y `Fuentes consolidadas`.
- Si un plan nuevo reemplaza a otro, el viejo deja de ser activo en el mismo movimiento y pasa a `archivado/` o `completado/` según corresponda.

### `docs/plans/completado/`

- Un plan se mueve aquí cuando su resultado principal ya existe de forma sustancial en el repo actual.
- Puede quedar deuda menor o follow-up futuro, pero no un gap central que todavía dependa de ese mismo documento como fuente de verdad.
- Estos planes conservan trazabilidad de cómo se cerró un frente; no deben usarse para abrir trabajo nuevo sin un plan activo aparte.

### `docs/plans/archivado/`

- Aquí viven snapshots, planes reemplazados o backlog histórico que ya no debe competir como fuente activa.
- No se reactiva trabajo editando un archivo archivado; si reaparece una brecha, se crea un plan nuevo en `falta/` y se referencia el histórico.
- La estructura fechada de archivado debe preservarse para mantener contexto sobre cuándo y por qué cambió la clasificación.

## Reglas mínimas de mantenimiento

- `docs/README.md`, `docs/plans/README.md` y el contenido real de `docs/plans/` deben contar la misma historia.
- Cada movimiento entre `falta/`, `completado/` y `archivado/` debe actualizar sus índices y enlaces en el mismo frente de trabajo.
- Los links del mapa documental deben resolver a archivos o carpetas existentes.
- Un plan activo debe referenciar decisiones de arquitectura y runbooks en vez de duplicar su contenido.
