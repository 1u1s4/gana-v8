# Plan de cierre de sandbox y QA — gana-v8

**Estado actual confirmado (2026-04-21)**

- `pnpm test:sandbox:certification` pasó con 2 goldens y 0 diffs.
- `apps/sandbox-runner` ya ejecuta modos `smoke`, `replay`, `cron-validation` y genera evidence packs de certificación.
- `packages/testing-fixtures` ya define perfiles `local-dev`, `ci-smoke`, `ci-regression` y `historical-backtest`, además de fixture packs sintéticos y timeline determinístico.
- `packages/config-runtime` ya define `staging-like`, pero ese perfil todavía no está cerrado como harness de prueba con paridad explícita.
- `public-api` ya lee certification bundles desde goldens/evidence y `operator-console` ya los muestra.

## Resumen actual

El repo ya tiene un sandbox útil y verificable, no una idea futura: hay runner, packs sintéticos, goldens, certificación determinística y visibilidad operativa de esos resultados. La plataforma ya puede probar slices reales con replay y comparar salidas.

El faltante real está en transformar ese sandbox funcional en un ecosistema de QA completo. Eso requiere más perfiles, más aislamiento de capacidades cognitivas, más cobertura contractual y de cron workflows, además de gates de promoción que conviertan la evidencia de certificación en decisión operativa formal.

## Ya cubierto

- `sandbox-runner` materializado con modos de ejecución y certificación.
- Profiles base de sandbox y replay en `packages/testing-fixtures`.
- Namespaces aislados de runtime, persistence, execution e identity para corridas sandbox.
- Fixture packs sintéticos, fingerprints, comparaciones determinísticas y goldens versionadas.
- Certificación que produce evidence packs y compara contra goldens con diff explícito.
- Lectura de certificación desde `public-api` y visibilidad correspondiente en `operator-console`.
- Cobertura amplia de pruebas unitarias/integración por package y app, más certificación sandbox como evidencia adicional.

## Faltantes vigentes

### 1. Catálogo de perfiles incompleto

- Faltan perfiles adicionales que aparecían repetidamente en los planes originales: `hybrid`, `chaos-provider` y `human-qa-demo`.
- `staging-like` existe en runtime config, pero no tiene todavía una expresión equivalente y gobernada dentro del harness de sandbox.
- Hace falta una matriz más explícita de qué providers, dependencias y side effects están permitidos por perfil.

### 2. Contract, cron y subagent testing más amplios

- Ya hay pruebas por workspace y cron validation base, pero falta cubrir más contratos cruzados, workflows programados y superficies de research multiagente.
- El ownership del testing de `Claim`, `SourceRecord` y `ResearchBundle` vive aquí una vez que esos contratos existan.
- También faltan suites orientadas a promotion safety, publication safety y escenarios de degradación operativa más complejos.

### 3. Gates formales de promoción

- La certificación existe, pero todavía no se traduce en una política formal de promoción `dev -> staging -> prod`.
- Falta consolidar qué evidencia mínima debe pasar para permitir promoción, qué umbrales degradan y qué fuerza review manual.
- Este plan es dueño del diseño de esos gates; el plan de plataforma sólo debe consumirlos operacionalmente.

### 4. Aislamiento de memory, sessions y skills

- El sandbox actual ya aísla namespaces de ejecución y persistencia, pero las superficies cognitivas del ecosistema Hermes siguen más cerca de scaffolding que de aislamiento completo.
- Falta modelar con más precisión memory stores, sessions, skill enablement y routing de capabilities por profile.
- También hace falta impedir con más claridad que un perfil de QA herede accidentalmente comportamientos o credenciales de operación real.

### 5. QA operacional y escenarios realistas

- Falta cerrar un perfil de QA humana y escenarios de chaos/hybrid para simular degradaciones parciales, providers mixtos y workflows con intervención humana.
- También faltan paquetes de regresión y dashboards/gates pensados para promociones repetibles, no sólo para smoke o replay aislado.
- La meta no es tener más tests por volumen, sino una evidencia de calidad que sirva para decidir promoción y debugging.

## Plan de cierre priorizado

### Tramo 1. Completar el catálogo de perfiles

- Agregar `hybrid`, `chaos-provider` y `human-qa-demo` al catálogo del sandbox.
- Traducir `staging-like` a un harness real con reglas explícitas de allowlist, side effects, secrets y publication safety.
- Declarar por profile qué proveedores pueden ser mock, replay, live-readonly o mixtos.

### Tramo 2. Expandir artefactos de prueba

- Extender fixture packs, replay packs y assertions packs para cubrir cron workflows, promotion safety y research contracts nuevos.
- Hacer que las suites de contrato y subagentes usen los mismos artefactos base siempre que sea posible.
- Versionar estas superficies como activos de producto, no como tests aislados del repositorio.

### Tramo 3. Definir gates de promoción

- Convertir certificación, replay parity, contract tests y smoke suites en una política formal de promoción.
- Definir estados mínimos como `blocked`, `review-required` y `promotable` con criterios objetivos.
- Exponer esa política como salida consumible por `public-api`, `operator-console` y `hermes-control-plane`.

### Tramo 4. Aislar superficies cognitivas

- Separar memory, sessions, skills y routing por profile con el mismo rigor ya usado para persistence y execution namespace.
- Restringir capabilities por profile y por tipo de corrida para evitar bleed operativo.
- Dejar trazabilidad suficiente para auditar qué capability o skill estuvo habilitada en cada sandbox run.

### Tramo 5. QA humana y chaos

- Materializar un perfil de QA humana para recorridos operativos supervisados.
- Introducir chaos y provider mixing de forma controlada para validar degradación segura.
- Hacer que estos perfiles alimenten directamente los gates de promoción, no que vivan como experimentos sueltos.

## Criterio de done

- El catálogo de sandbox incluye perfiles base y perfiles avanzados con policy clara por dependencia.
- `staging-like` tiene paridad explícita dentro del harness y no sólo en runtime config.
- Existen suites y artefactos para contract tests, cron workflows y research/subagent testing.
- Los gates de promoción están definidos y producen estados operables por otras superficies.
- Memory, sessions y skills quedan aislados por profile con trazabilidad suficiente para auditoría.
