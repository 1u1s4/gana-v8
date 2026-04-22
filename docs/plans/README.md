# Planes de trabajo

Esta carpeta agrupa planes y propuestas de implementación de `gana-v8`.

## Estructura

- `completado/`: planes cuyo alcance principal ya quedó materializado de forma sustancial en el repo actual.
- `falta/`: planes canónicos vigentes para cerrar brechas reales del repo actual.
- `archivado/2026-04-21-falta-originales/`: snapshot íntegro de los 7 planes previos que se consolidaron durante la limpieza documental del 21 de abril de 2026.

## Planes vigentes en `falta/`

- `gana-v8-plan-cierre-sandbox-qa.md`

## Planes relevantes en `completado/`

- `gana-v8-plan-cierre-plataforma-operacion.md`

## Criterio de clasificación

La clasificación se hizo comparando cada plan contra el estado real del código, contratos, apps, paquetes, Prisma, scripts y superficies operativas del repositorio.

Un plan quedó en `completado/` cuando su resultado principal ya existe en el repo, aunque haya diferencias menores de naming o layout.

Un plan quedó en `falta/` cuando el repo ya tiene avance claro, pero todavía faltan capacidades, contratos, perfiles, tablas, flujos o superficies que el documento proponía como parte central del alcance.

## Nota de mantenimiento

Los planes dentro de `falta/` están escritos con enfoque `gap-first`: parten del estado actual confirmado, separan explícitamente lo ya cubierto de lo todavía pendiente y asignan cada gap a un solo plan.

Los 7 documentos originales que antes vivían en `falta/` se conservaron sin editar dentro de `archivado/2026-04-21-falta-originales/` para mantener trazabilidad histórica sin dejar múltiples fuentes activas compitiendo entre sí.
