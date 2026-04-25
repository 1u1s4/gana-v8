# SRS

Esta carpeta contiene especificaciones de requisitos de software. Su funcion es fijar capacidades, fronteras, restricciones y criterios de aceptacion antes de abrir planes de implementacion.

## Especificaciones vigentes

- [`gana-v9-harness-first-srs.md`](./gana-v9-harness-first-srs.md): SRS para una v9 compacta, TUI-first, con harness operativo, Codex/OpenAI auth y menos dependencias externas.

## Regla de uso

- Un SRS no reemplaza a `docs/plans/falta/`: cuando el trabajo entre como gap activo del repo actual, debe existir un plan unico en `docs/plans/falta/`.
- Un SRS no debe duplicar runbooks ejecutables; debe enlazarlos cuando necesite procedimientos operativos.
- Si una especificacion se vuelve obsoleta, debe marcarse con estado y reemplazo en el propio documento antes de crear otra especificacion competidora.
