# Gana v9 Harness-First SRS

## Estado

- Estado: draft canonico para diseno de v9.
- Fecha: 2026-04-25.
- Alcance: requisitos de producto y sistema para una v9 compacta, dirigida por harness y operada primero desde TUI.
- No es un plan activo de `gana-v8`; si se decide implementarlo dentro de este repo, debe abrirse un plan unico en `docs/plans/falta/`.

## 1. Proposito

Gana v9 debe ser una plataforma compacta de prediccion deportiva donde el producto principal no sea primero un dashboard web, sino un harness operativo auditable. La primera interfaz debe ser una TUI inspirada en `create-agent-tui`, adaptada a Codex/OpenAI auth y al dominio de predicciones deportivas.

El ciclo canonico de v9 es:

```text
fixture -> odds -> research evidence -> scoring -> prediction candidate -> parlay candidate -> validation artifact
```

La meta es conservar lo mejor de v6/v7/v8 sin repetir su dispersion:

- v6 aporta el command center visual, seleccion batch, flujos de ETL/prediccion y una consola densa.
- v7 aporta el producto compacto, ETL autonomo, atomas/parlays, queue durable, validation y contratos value-focused.
- v8 aporta repo-as-harness, evidence packs, research gates, runtime durable, goldens, runbooks y discipline de promotion.
- `create-agent-tui` aporta la forma TUI: config, agent runner, tools, renderer, sessions y slash commands.

## 2. Objetivos

- Operar el flujo completo desde una TUI local antes de construir superficies web.
- Reducir dependencias externas obligatorias a Codex/OpenAI y un unico provider deportivo live-readonly.
- Hacer que cada decision publicable tenga trazabilidad a sources, evidence, AI run, prompt version y validation artifact.
- Convertir cada corrida importante en artifact reproducible.
- Bloquear acciones mutantes salvo approval explicito.
- Mantener un runtime inicial pequeno: scheduler, dispatcher y recovery como modulos internos de un unico harness.
- Permitir CI y smoke sin credenciales reales mediante fixtures mock/replay.

## 3. No Objetivos Iniciales

- No reconstruir el dashboard web completo de v6/v7 en v1.
- No depender de OpenRouter como runtime, model registry o proveedor de tools.
- No soportar multiples proveedores LLM en v1.
- No incluir Groq vision, Heroku management, image generation, JS REPL ni web fetch generico.
- No publicar automaticamente predicciones/parlays sin approval.
- No iniciar con todos los mercados de v7/v8; corners y mercados experimentales quedan fuera de v1 salvo flag posterior.
- No reintroducir `apps/hermes-control-plane` como runtime primario.

## 4. Usuarios Y Modos De Operacion

### Usuario primario

Operador tecnico que ejecuta, inspecciona y valida predicciones deportivas desde terminal. Acepta TUI como interfaz inicial y necesita evidencia auditable, no solo output narrativo.

### Modos requeridos

- `mock`: no usa red ni secretos; sirve para dev rapido y unit tests.
- `replay`: usa fixtures y payloads versionados; sirve para certification y regression.
- `live-readonly`: consulta provider deportivo real con guardrails, rate limits y sin escritura fuera del namespace activo.
- `release-grade`: exige DB durable, evidence pack, approval y validacion focalizada.

## 5. Arquitectura De Alto Nivel

La estructura inicial recomendada es:

```text
apps/
  gana-tui/
packages/
  ai-runtime/
  domain/
  evidence/
  harness-runtime/
  provider-adapters/
  scoring/
  validation/
  testing-fixtures/
docs/
  srs/
fixtures/
  replays/
tests/
  certification/
```

El runtime inicial debe ser un unico proceso/harness con modulos internos:

- scheduler: crea runs o tasks desde comandos, fechas y cron specs.
- dispatcher: ejecuta steps y tools con policy.
- recovery: resume, redrive, cancela o marca failed con evidencia.
- artifact writer: emite JSONL, summaries y evidence packs.

La separacion en apps independientes solo debe ocurrir cuando exista necesidad operacional demostrada.

## 6. Interfaz TUI

La TUI debe adaptar la estructura de `create-agent-tui`, pero con runtime propio:

- `config`: carga profile, auth mode, model, provider mode, artifact root y policy.
- `agent`: coordina Codex/OpenAI calls y tool execution.
- `tools`: expone tools read-only y mutating con approval.
- `renderer`: muestra eventos agrupados, output streaming, tasks y artifacts.
- `session`: persiste conversaciones y eventos en JSONL append-only.
- `commands`: implementa slash commands operativos.

### Slash commands requeridos

- `/help`: lista comandos y modos.
- `/new`: inicia sesion nueva.
- `/model`: cambia modelo dentro del registry local permitido.
- `/session`: muestra metadata, artifact root, usage y auth status redacted.
- `/export`: exporta sesion a Markdown y JSONL.
- `/run`: ejecuta un flujo o step del harness.
- `/validate`: corre validacion focalizada.
- `/certify`: corre certification smoke/regression.

### Comandos CLI requeridos

```bash
pnpm gana
pnpm gana fixtures --date YYYY-MM-DD
pnpm gana odds --date YYYY-MM-DD --provider replay
pnpm gana research --fixture-id ID --web required
pnpm gana score --fixture-id ID
pnpm gana parlay --date YYYY-MM-DD
pnpm gana validate --date YYYY-MM-DD
pnpm gana certify --profile ci-smoke
```

## 7. Autenticacion Codex/OpenAI

v9 debe soportar dos modos explicitos:

- `codex-local`: usa credencial local generada por Codex CLI cuando exista.
- `api-key`: usa `OPENAI_API_KEY` o `CODEX_API_KEY` desde entorno o secret manager.

Reglas:

- `codex-local` es recomendado para uso interactivo local.
- `api-key` es recomendado para CI, servidores y smoke headless.
- El sistema no debe depender de endpoints privados no documentados como unica opcion.
- Si `codex-local` no esta disponible, la TUI debe degradar con mensaje accionable y no intentar extraer secretos.
- Tokens, refresh tokens, headers completos y `.env` con secretos nunca deben versionarse ni imprimirse.
- La TUI solo puede mostrar estado redacted: autenticado, no autenticado, modelo resuelto y usage resumido.

## 8. Tools Y Approval Policy

### Tools read-only por defecto

- `file_read`
- `grep`
- `glob`
- `list_dir`
- `fixture_lookup`
- `artifact_read`
- `session_read`

### Tools con approval obligatorio

- `shell`
- `file_edit`
- `run_harness_task`
- `provider_live_readonly`
- `prediction_publish_candidate`
- `artifact_promote`

### Tools fuera de v1

- `file_write` general.
- `web_fetch` generico.
- `js_repl`.
- `image_generation`.
- `sub_agent` interno.

La policy de approval debe registrar:

- quien aprobo;
- comando o accion aprobada;
- argumentos redacted;
- timestamp;
- session ID;
- run ID;
- resultado.

## 9. Flujo Funcional Canonico

### RF-1: Discover fixtures

El sistema debe listar fixtures por fecha, competition y provider mode. En `mock` y `replay`, no debe requerir red.

### RF-2: Ingest odds

El sistema debe capturar y normalizar odds hacia `CanonicalMarketSnapshot`.

Campos minimos:

- fixture ID;
- provider;
- capturedAt;
- bookmaker count;
- market key;
- selection key;
- price;
- implied probability;
- payload hash;
- source snapshot ID.

### RF-3: Select fixtures

El operador debe poder seleccionar fixtures manualmente o con policy conservadora:

- kickoff window;
- odds available;
- provider confidence;
- no validation blockage;
- no duplicate active run.

### RF-4: Run research

Research debe producir datos estructurados, no solo texto:

- `SourceRecord`;
- `EvidenceItem`;
- `Claim`;
- `ResearchGateResult`.

Modo web:

```ts
type WebResearchMode = "disabled" | "auto" | "required";
```

Si `required` no produce fuentes verificables, el bundle debe quedar `hold` con razon `web-research-empty`.

### RF-5: Score prediction

El scoring debe generar predicciones atomicas para mercados v1:

- `h2h`;
- `double_chance`;
- `goals_over_under`.

Cada prediccion debe incluir:

- probability;
- implied probability;
- edge;
- confidence;
- selected market;
- selected outcome;
- evidence IDs;
- model;
- prompt version;
- reasoning breve;
- status;
- generatedAt.

### RF-6: Build parlay

El parlay builder debe:

- usar solo predicciones publicables;
- limitarse a 3 legs por defecto;
- explicar riesgo agregado;
- rechazar markets experimentales salvo flag;
- requerir approval para promotion.

### RF-7: Validate settlement

La validacion posterior debe generar `ValidationArtifact` con:

- prediction ID;
- result input;
- settlement rule version;
- status;
- timestamp;
- evidence links;
- error o degradation reason si aplica.

## 10. Modelo De Datos Compacto

Entidades minimas:

- `Fixture`
- `Team`
- `Competition`
- `ProviderSnapshot`
- `CanonicalMarketSnapshot`
- `ResearchBundle`
- `SourceRecord`
- `EvidenceItem`
- `Claim`
- `AiRun`
- `Prediction`
- `Parlay`
- `ParlayLeg`
- `ValidationArtifact`
- `HarnessTask`
- `HarnessRun`
- `Artifact`
- `Approval`

Principios:

- Raw payloads se guardan solo cuando aportan replay, audit o debug.
- Todo output publicable debe enlazar run, evidence y source.
- Todo claim critico necesita fuente oficial o corroboracion.
- Todo task debe cerrar con artifact o razon de no generacion.
- El schema debe favorecer compactacion frente a tablas duplicadas por UI.

## 11. Eventos Del Harness

Todo step debe emitir eventos normalizados:

```ts
type HarnessEvent =
  | "task.started"
  | "task.progress"
  | "provider.requested"
  | "provider.rate_limited"
  | "ai.started"
  | "ai.delta"
  | "ai.completed"
  | "approval.requested"
  | "approval.granted"
  | "artifact.written"
  | "gate.passed"
  | "gate.blocked"
  | "task.completed"
  | "task.failed";
```

Cada evento debe incluir:

- `eventId`;
- `runId`;
- `taskId`;
- `correlationId`;
- `traceId`;
- `timestamp`;
- `profile`;
- `severity`;
- `payload` redacted cuando aplique.

## 12. Artifacts Y Evidence Packs

Artifacts por defecto:

```text
.artifacts/gana-v9/
  sessions/
  runs/
  evidence-packs/
  certification/
```

Un evidence pack debe contener:

- manifest;
- profile;
- input fixture IDs;
- provider mode;
- AI model/resolution;
- research sources;
- claims;
- predictions;
- validations;
- approvals;
- gate results;
- hashes de payloads relevantes;
- comandos de reproduccion.

## 13. Seguridad

Requisitos obligatorios:

- Toda accion mutante requiere approval en TUI o token operativo.
- Live network esta deshabilitado por defecto.
- `live-readonly` no puede escribir fuera del namespace activo.
- Shell debe tener timeout, cap de output y denylist minima.
- Secrets deben redactarse en logs, sessions, artifacts y errores.
- CI debe correr con `mock` o `replay`.
- Cualquier `.env` versionado con secretos es bloqueante.
- La TUI debe advertir cuando el profile no sea seguro para promotion.

## 14. Requisitos No Funcionales

- Node.js 22+.
- TypeScript estricto.
- pnpm workspaces.
- Prisma/MySQL para modo durable release-grade.
- JSONL permitido para session y artifacts.
- SQLite o almacenamiento local solo permitido para smoke no release-grade.
- Tests unitarios para contracts, scoring, validation, approvals y session persistence.
- Certification smoke sin credenciales reales.
- Mensajes de fallo accionables: archivo, condicion esperada, condicion recibida y proxima accion.

## 15. Testing Y Certificacion

### Tests minimos

- config/auth resolution sin imprimir secretos;
- session JSONL append-only;
- renderer de eventos agrupados;
- approval policy;
- fake Codex adapter;
- web research required con fuentes vacias bloquea;
- market snapshot canonicalization;
- scoring para mercados v1;
- validation settlement por mercado;
- evidence pack manifest.

### Certification smoke

`pnpm gana certify --profile ci-smoke` debe:

- no usar credenciales reales;
- cargar fixtures replay;
- ejecutar odds, research, score y validation;
- generar evidence pack;
- producir resultado deterministico.

## 16. Criterios De Aceptacion

v9 se considera funcional cuando:

- `pnpm gana` abre la TUI en modo mock sin credenciales reales.
- La TUI muestra session, model/auth status redacted y artifact root.
- `pnpm gana certify --profile ci-smoke` genera evidence pack reproducible.
- Un fixture replay pasa por odds, research, scoring y validation.
- Research con `web required` bloquea si no hay fuentes.
- Una prediccion publicable enlaza evidence, source, AI run y validation status.
- Shell y edicion requieren approval.
- No hay dependencia obligatoria de OpenRouter, Groq, Heroku ni dashboard web.
- CI ejecuta lint, typecheck, tests y certification smoke.

## 17. Trazabilidad De Repos Fuente

### De `gana-v8`

Retener:

- repo-as-harness;
- goldens y evidence packs;
- research bundle gates;
- runtime durable con task/cycle/trace IDs;
- runbooks y scorecard de entropia;
- provider modes `mock`, `replay`, `live-readonly`.

Simplificar:

- reducir apps y packages iniciales;
- no partir de `hermes-control-plane` legacy;
- mover UI/API web a fase posterior;
- limitar mercados iniciales.

### De `v0-v7`

Retener:

- flujo autonomo ETL, enrichment, atomas, parlays, reconciliacion y validation;
- contratos value-focused: probability, implied probability, EV, edge, confidence;
- cola durable con dedupe y locks;
- normalizacion de odds y rate-limit observable.

Cambiar:

- separar ejecucion interactiva de worker durable;
- exigir auth/RBAC para acciones mutantes;
- reemplazar clientes no oficiales por boundary Codex/OpenAI documentado o adapter aislado.

### De `v0-gana-v6-dashboard-design`

Retener:

- command center compacto;
- seleccion batch;
- execution board;
- quota meters;
- terminal logs;
- date rail;
- settings operativos redacted.

Cambiar:

- TUI primero;
- web dashboard despues;
- eliminar dependencias obligatorias a Groq, Heroku y APIs extra.

### De `create-agent-tui`

Retener:

- estructura `config -> tools -> agent -> renderer -> session -> commands`;
- JSONL sessions;
- grouped tool display;
- slash commands;
- prompt composition con entrypoints del repo.

Cambiar:

- no usar `@openrouter/agent` como runtime obligatorio;
- no usar OpenRouter server tools;
- hacer approval obligatorio para tools mutantes;
- usar model registry local.

## 18. Referencias

- [`../../README.md`](../../README.md)
- [`../../AGENTS.md`](../../AGENTS.md)
- [`../README.md`](../README.md)
- [`../harness-principios-dorados.md`](../harness-principios-dorados.md)
- [`../plans/completado/gana-v8-harness-runtime-durable.md`](../plans/completado/gana-v8-harness-runtime-durable.md)
- [`../plans/completado/hermes-v8-blueprint-prediccion-partidos.md`](../plans/completado/hermes-v8-blueprint-prediccion-partidos.md)
- [`../plans/completado/hermes-v8-migracion-v7-a-v8-git-worktrees.md`](../plans/completado/hermes-v8-migracion-v7-a-v8-git-worktrees.md)
- [OpenRouter `create-agent-tui`](https://github.com/OpenRouterTeam/skills/tree/main/skills/create-agent-tui)
- [v0-v7](https://github.com/1u1s4/v0-v7)
- [v0-gana-v6-dashboard-design](https://github.com/1u1s4/v0-gana-v6-dashboard-design)
- [OpenAI Codex docs](https://platform.openai.com/docs/codex)
- [OpenAI Codex CLI auth](https://help.openai.com/en/articles/11381614)
- [OpenAI API authentication](https://platform.openai.com/docs/api-reference/authentication)
- [OpenAI Codex network guidance](https://platform.openai.com/docs/codex/agent-network)

## 19. Supuestos

- El operador principal es tecnico y acepta una TUI como superficie inicial.
- La primera version debe optimizar reproducibilidad y seguridad antes que amplitud de mercados.
- Codex/OpenAI sera el unico proveedor LLM inicial.
- El provider deportivo live inicial puede ser uno solo si existe modo replay robusto.
- Cualquier implementacion dentro de `gana-v8` debe respetar el lifecycle documental vigente y abrir plan activo separado antes de editar runtime.
