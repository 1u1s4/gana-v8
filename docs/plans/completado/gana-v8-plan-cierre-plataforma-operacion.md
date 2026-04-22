# Plan de cierre de plataforma y operación — gana-v8

**Estado actual confirmado (2026-04-21)**

- `pnpm test` pasó en el repo completo; la única reserva visible fue `hermes-control-plane`, donde 20 pruebas quedaron omitidas por depender de `DATABASE_URL`.
- `pnpm test:sandbox:certification` pasó con 2 goldens y 0 diffs.
- El monorepo ya expone apps reales en `apps/hermes-control-plane`, `apps/public-api`, `apps/operator-console`, `apps/ingestion-worker`, `apps/research-worker`, `apps/scoring-worker`, `apps/publisher-worker`, `apps/validation-worker` y `apps/sandbox-runner`.
- `prisma/schema.prisma` ya define base operacional en MySQL para fixtures, workflows, tareas, predicciones, parlays, validaciones, políticas diarias y namespaces sandbox.
- `packages/queue-adapters` ya cubre leases, reclaim, backoff, quarantine y redrive básico con pruebas.

**Actualización acotada (2026-04-22)**

- `apps/hermes-control-plane` quedó reetiquetada como compatibilidad temporal explícita para imports, tests y flujos legacy.
- La topología operativa recomendada pasa a ser `packages/control-plane-runtime` + `apps/hermes-scheduler` + `apps/hermes-dispatcher` + `apps/hermes-recovery`.
- El retiro total de callers legacy sigue pendiente; este documento no debe volver a tratar `hermes-control-plane` como runtime primario.

## Resumen actual

`gana-v8` ya no necesita un plan maestro aspiracional ni un gap analysis separado para describir que "algún día" habrá plataforma. La base existe y corre: hay monorepo operativo, cola persistible, workers separados, API interna, consola operativa, publicación base, validación base y perfiles runtime definidos.

El faltante real de este frente es cerrar la capa de operación para que deje de sentirse como un sistema funcional pero todavía híbrido entre scaffold, demo y plataforma durable. El trabajo pendiente ya no es "crear v8", sino endurecer la orquestación, aclarar ownership operativo, enriquecer estado y observabilidad y conectar la operación diaria con gates de release y recuperación.

## Ya cubierto

- Monorepo real con fronteras explícitas entre `apps/*` y `packages/*`, más `pnpm-workspace.yaml`, `turbo.json` y scripts uniformes de build/test/typecheck.
- Base de persistencia en MySQL con Prisma para entidades núcleo de operación: `Fixture`, `FixtureWorkflow`, `Task`, `TaskRun`, `Prediction`, `Parlay`, `Validation`, `DailyAutomationPolicy` y `SandboxNamespace`.
- Cola con leases, reclaim y retry/backoff ya modelada en `packages/queue-adapters`, hoy consumida por la topología operacional nueva y aún disponible para `hermes-control-plane` por compatibilidad.
- Runtime operacional compartido en `packages/control-plane-runtime` con apps separadas para scheduler, dispatcher y recovery; `apps/hermes-control-plane` queda sólo como compatibilidad temporal.
- Workers principales materializados para ingestión, research, scoring, publicación, validación y sandbox.
- `public-api` con read models operativos y `operator-console` como superficie separada de supervisión.
- Publicación y validación base ya presentes: `packages/publication-engine`, `apps/publisher-worker`, `packages/validation-engine` y `apps/validation-worker`.
- Perfiles runtime existentes en `packages/config-runtime`: `local-dev`, `ci-smoke`, `ci-regression`, `staging-like`, `historical-backtest` y `production`.

## Faltantes vigentes

### 1. Orquestación más persistente y separable

- El scheduler y el dispatcher todavía están demasiado cerca de ciclos in-process y helpers del control-plane.
- Falta una separación más explícita entre scheduler, dispatcher, runners y recovery loop para operación distribuida sostenida.
- Los manifests de ejecución y ownership por ciclo existen, pero todavía no forman una topología operacional claramente durable.

### 2. Estado operacional más rico por workflow

- `FixtureWorkflow` ya cubre estados base, pero todavía no expresa con suficiente detalle readiness, bloqueos, degradaciones, manual review, retries y razones explicables por etapa.
- Faltan read models más completos para seguir un workflow entero por fixture, jornada y corrida sin reconstrucción manual.
- La consola y la API ya muestran estado, pero aún no ofrecen una narrativa operacional suficientemente profunda para incidentes o handoff humano.

### 3. Menos superficies demo/scaffold

- El repo sigue cargando varias descripciones y flows de tipo `demo`, `scaffold` o `placeholder` en README, runtime flags y seeds operativos.
- Hace falta distinguir mejor qué superficies son de bootstrap, cuáles son de operación diaria y cuáles deben endurecerse antes de tratarlas como runtime productivo.
- El objetivo no es borrar la instrumentación de demo, sino encapsularla para que no compita con la lectura de "plataforma operable".

### 4. Governance y observabilidad más profundas

- Ya existen `packages/observability`, `packages/policy-engine` y read models de salud, pero faltan señales más completas de scheduler health, queue pressure, DLQ, redrives, approvals y readiness de release.
- Falta consolidar métricas y trazas de extremo a extremo con una semántica común entre control-plane, workers y superficies operativas.
- Todavía no hay una vista única suficientemente dura para auditoría operacional, incident review y aprobación de promoción.

### 5. Cierre operativo y release readiness

- La plataforma todavía no consume de forma explícita un gate único de "lista para promover" o "lista para operar" basado en evidencia objetiva.
- El diseño detallado de promotion gates y evidence packs vive en el frente de sandbox/QA; este plan sólo debe cerrar cómo la topología operacional nueva, `public-api` y `operator-console` consumen ese resultado.
- También falta cerrar redrive manual, quarantine review y flujos de override con menos ambigüedad operativa.

## Plan de cierre priorizado

### Tramo 1. Harden de orquestación

- Mantener `apps/hermes-control-plane` únicamente como fachada de compatibilidad mientras la responsabilidad de cron scheduling, dispatch, lease recovery y task execution vive en la topología nueva.
- Hacer persistente la información mínima necesaria para que un proceso pueda retomar trabajo sin depender del ciclo que lo disparó.
- Dejar claro qué partes son helpers de desarrollo y qué partes son runtime operational-grade.

### Tramo 2. Workflow state y read models

- Expandir el modelo operacional por fixture para cubrir bloqueos, degradaciones, motivos de skip, review manual, retries y dependencias entre etapas.
- Exponer estos estados en `public-api` con contratos legibles y reflejarlos en `operator-console`.
- Unificar naming entre estado persistido, estado mostrado y estado usado por policies.

### Tramo 3. Governance y observabilidad

- Consolidar métricas de queue pressure, retries, quarantines, approvals, provider health y trace coverage en una sola lectura operacional.
- Hacer que los artefactos de auditoría de tareas, AI runs, publicación y validación se puedan navegar como una sola historia por fixture o corrida.
- Definir qué señales deben bloquear operación o promoción, aunque el detalle de testing/promoción viva en el plan sandbox/QA.

### Tramo 4. Desacople de demo/scaffold

- Reetiquetar documentación y flows de demo para que no se interpreten como capacidad productiva cerrada.
- Encapsular seeds, flags y rutas de bootstrap detrás de naming explícito.
- Reducir lenguaje de "scaffold" donde el repo ya tiene slices funcionales y pruebas reales.

### Tramo 5. Integración con gates de promoción

- Consumir en la topología operacional nueva y en superficies operativas el resultado de certificación y promoción definido por el plan de sandbox/QA; `hermes-control-plane` no es el destino recomendado para nuevas integraciones.
- Exponer un estado operacional claro de "no promover", "promover con review" o "listo para promover".
- Dejar el ownership del diseño de los gates en `gana-v8-plan-cierre-sandbox-qa.md` para evitar duplicación.

## Criterio de done

- El scheduler, dispatcher y recovery loop quedan separados y operables sin depender de helpers de demo.
- Existe un read model por fixture/corrida que explica etapa actual, bloqueos, skips, retries y overrides sin reconstrucción manual.
- `public-api` y `operator-console` exponen una lectura consistente de salud operacional, queue pressure, quarantines y readiness.
- La documentación principal deja de describir la plataforma como scaffold inicial cuando habla de capacidades ya materializadas.
- La plataforma consume gates de promoción y evidencia de sandbox/QA sin duplicar su definición.
