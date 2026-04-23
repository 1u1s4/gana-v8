# Rubrica de evaluacion agentic

## Version

Version: 1.0

Esta rubrica evalua entregas agentic en `gana-v8`. Aplica a sprints, subfrentes y handoffs cuando el orquestador pide una decision de aprobacion.

Estados canonicos de salida:

- `promotable`: listo para integrar o cerrar.
- `review-required`: faltan ajustes acotados o evidencia menor.
- `blocked`: no debe integrarse hasta corregir hallazgos bloqueantes.

## Baseline

El evaluador debe partir del contrato de sprint, el diff real y la evidencia de validacion disponible.

Baseline esperado:

- El objetivo esta declarado y es comprobable.
- El ownership coincide con los archivos tocados.
- No hay cambios fuera de alcance sin decision explicita.
- La validacion corresponde al riesgo del cambio.
- La documentacion durable fue actualizada cuando el comportamiento o backlog cambio.
- Los riesgos abiertos no bloquean operacion, release ni mantenimiento.
- El candidate supera al baseline simple en claridad, evidencia, costo razonable o reduccion de drift.

## Dimensiones

Cada dimension se califica de 0 a 3.

- 0: ausente o incorrecto.
- 1: parcial, ambiguo o con riesgo alto.
- 2: suficiente para avanzar con observaciones menores.
- 3: completo, verificable y alineado con el repo.

Dimensiones:

- Objetivo y alcance: el entregable resuelve el problema declarado sin expandirse indebidamente.
- Ownership: respeta archivos, worktree, rama y cambios de terceros.
- Correctitud tecnica: el comportamiento, contratos, fixtures o docs son coherentes con la topologia vigente.
- Validacion: los checks ejecutados son adecuados y sus resultados estan documentados.
- Evidencia: el handoff permite reproducir la decision del evaluador.
- Mantenibilidad: el cambio reduce ambiguedad y no crea fuentes canonicas competidoras.
- Riesgo operativo: riesgos, mitigaciones y owners estan claros.
- Costo y latencia: el trabajo uso subagentes, contexto y comandos caros solo cuando aportaban lift frente al baseline.

## Thresholds de aprobacion

- `promotable`: puntaje total minimo 21/24, ninguna dimension en 0 y ninguna dimension critica bajo 2.
- `review-required`: puntaje total minimo 17/24, sin dimensiones en 0, con acciones menores explicitadas.
- `blocked`: cualquier dimension en 0, puntaje total menor a 17/24, evidencia insuficiente o violacion de ownership.

Dimensiones criticas: Ownership, Correctitud tecnica, Validacion y Evidencia.

Una entrega con cambios fuera de ownership no puede aprobarse aunque el puntaje numerico sea suficiente.

Criterios bloqueantes no numericos:

- `done` o validacion no estan declarados.
- Checks omitidos no tienen justificacion.
- Indices, planes activos o docs canonicos quedan en drift.
- Falta handoff para reset, compaction, relevo o trabajo multi-sesion.
- La salida del evaluador es solo narrativa y no contiene decision accionable.

## Evidencia requerida

El evaluador debe exigir evidencia proporcional al cambio:

- Lista de archivos modificados.
- Resumen de decisiones relevantes.
- Comandos de validacion ejecutados y resultado.
- Checks omitidos con justificacion.
- Riesgos abiertos con owner y proxima accion.
- Links o referencias a PR, commit, worktree, plan o runbook cuando existan.

Para cambios documentales, tambien debe verificarse que no haya documentos activos competidores y que los encabezados obligatorios sigan presentes.

## Salida del evaluador

La salida debe ser corta, accionable y estable.

Formato recomendado:

```text
Decision: promotable | review-required | blocked
Puntaje: N/24
Resumen: una o dos frases
Evidencia revisada: archivos, comandos y referencias
Hallazgos: lista priorizada o "Sin hallazgos bloqueantes"
Condiciones: acciones requeridas antes de merge, si aplica
Riesgos residuales: riesgos aceptados y owner
```

Si hay hallazgos, deben incluir severidad, archivo o superficie afectada y accion esperada.

## Reevaluacion

Debe reevaluarse cuando:

- Cambia el diff despues de la evaluacion.
- Se agregan o remueven checks de validacion.
- Aparece un conflicto de ownership o merge.
- Cambia un documento canonico, runbook, fixture golden o contrato publico relacionado.
- Una condicion bloqueante fue corregida.

La reevaluacion debe referenciar la decision previa y explicar que evidencia nueva cambio el resultado.
