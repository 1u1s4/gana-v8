# Plan de cierre de harness core y claridad para agentes — gana-v8

**Estado actual confirmado (2026-04-22)**

- El repo no tiene `AGENTS.md` ni `CLAUDE.md` como entrypoint corto y estable para agentes.
- `docs/plans/falta/` está vacío, aunque `docs/plans/README.md` ya define que esa carpeta es la fuente de verdad para brechas vigentes con enfoque `gap-first`.
- `README.md` todavía referencia `docs/plans/falta/gana-v8-plan-cierre-sandbox-qa.md`, pero ese archivo no existe en `falta/`.
- El conocimiento operativo está repartido entre `README.md`, `docs/adr/`, `docs/architecture/`, `docs/plans/` y `runbooks/`, pero sin un índice común orientado a ejecución agentic.
- Existe una regla mecánica mínima en `scripts/workspace-lint.mjs`, pero no hay enforcement comparable para arquitectura documental, lifecycle de planes, freshness de docs o link hygiene.
- Solo existe un runbook operativo activo en `runbooks/sandbox-certification.md`; el resto de la operación depende de código, planes completados y conocimiento implícito.

## Resumen actual

`gana-v8` ya tiene bastante conocimiento útil dentro del repositorio, pero todavía no opera como un harness maduro en el plano “repo as environment”. Hoy el código y la documentación sirven a humanos familiarizados con el proyecto, pero no hay un contrato pequeño, durable y verificable que permita a un agente entrar, orientarse, ejecutar trabajo largo y retomar contexto sin redescubrir el sistema.

La brecha principal de este frente no es “escribir más documentación”, sino transformar el repo en un system of record legible por agentes: un índice de entrada estable, taxonomía explícita de documentos, lifecycle claro para backlog activo vs histórico, protocolo de handoff entre subagentes y reglas mecánicas que conviertan drift documental en fallas detectables.

## Ya cubierto

- `docs/adr/` ya fija decisiones duras del sistema, por ejemplo control plane explícito y quality gates de research.
- `docs/plans/README.md` ya define una convención útil para separar `falta/`, `completado/` y `archivado/`.
- `docs/architecture/` ya contiene una lectura visual del sistema y su topología operacional.
- `docs/plans/completado/` y `docs/plans/archivado/2026-04-21-falta-originales/` ya preservan trazabilidad de planes ejecutados y de backlog histórico.
- `README.md` ya documenta la topología operativa principal, comandos base y superficies relevantes del repo.
- `scripts/workspace-lint.mjs` ya demuestra que el repo acepta enforcement mecánico básico en vez de depender solo de convenciones verbales.

## Faltantes exclusivos

### 1. Entry point canónico para agentes

- Definir un `AGENTS.md` en raíz como contrato futuro, corto e indexador, que apunte a arquitectura, planes activos, runbooks, comandos y restricciones.
- Adoptar divulgación progresiva: el agente debe arrancar con mapa, no con un manual extenso ni con documentos redundantes.
- Explicitar qué información debe vivir en el repo para considerarse visible a agentes y qué información no puede seguir viviendo solo en chat, memoria humana o archivos dispersos.

### 2. Taxonomía y lifecycle de documentación

- Formalizar la taxonomía mínima de `docs/` para distinguir arquitectura, ADRs, planes activos, planes completados, backlog histórico y runbooks operativos.
- Definir reglas de movimiento entre `falta/`, `completado/` y `archivado/` para evitar que coexistan múltiples documentos activos compitiendo por el mismo frente.
- Exigir sincronización entre `README.md`, `docs/plans/README.md` y el estado real de los planes vigentes para evitar drift como el link roto actual.

### 3. Modelo de trabajo con subagentes y handoff durable

- Documentar cuándo conviene usar subagentes y cuándo no, con ownership exclusivo por frente para evitar trabajo duplicado.
- Definir artefactos mínimos de handoff entre sesiones y entre subagentes: objetivo, estado, decisiones tomadas, riesgos abiertos y próxima acción.
- Explicitar cómo deben usarse worktrees o aislamientos equivalentes cuando el trabajo largo requiera paralelismo o recuperación de contexto.

### 4. Reglas mecánicas para claridad del repo

- Extender la filosofía de `workspace-lint` a reglas documentales y estructurales: links válidos, índices actualizados, secciones obligatorias y naming consistente.
- Definir qué invariantes deben aplicarse mecánicamente en el plano repo-as-harness, por ejemplo existencia de entrypoint agentic, índice de planes activos y estructura mínima de runbooks.
- Separar claramente lo que es preferencia editorial de lo que es invariante del harness.

### 5. Doc-gardening y control de drift

- Crear un proceso recurrente de revisión documental para detectar planes obsoletos, links rotos, contradicciones entre README y estado real del código, y documentos que dejaron de ser canónicos.
- Definir cómo se reporta y cómo se corrige el drift: check mecánico, issue, PR automática o tarea periódica de mantenimiento.
- Evitar que el repo dependa de limpiezas manuales esporádicas para mantenerse legible por agentes.

## Interfaces/contratos afectados

- `AGENTS.md` en raíz como índice estable y corto del repo.
- Taxonomía obligatoria para `docs/`, con responsabilidades mínimas por carpeta.
- Plantilla obligatoria para planes activos en `docs/plans/falta/`, incluyendo `Estado actual confirmado`, `Ya cubierto`, `Faltantes exclusivos`, `Interfaces/contratos afectados`, `Dependencias`, `Criterio de done` y `Fuentes consolidadas`.
- Contrato de handoff para trabajo con subagentes y sesiones largas.
- Checks mecánicos mínimos para vigencia documental, estructura y enlaces.

## Dependencias

- Toma como referencia el cierre de `docs/plans/completado/gana-v8-harness-runtime-durable.md` para enlazar desde el entrypoint agentic la topología runtime oficial y sus invariantes.
- Depende del cierre de `docs/plans/completado/gana-v8-harness-verificacion-release-ops-y-runbooks.md` para enlazar runbooks, promotion gates y superficies operativas activas sin duplicar su definición.
- Debe reutilizar y no reemplazar `docs/adr/`, `docs/architecture/`, `docs/plans/README.md` y los planes ya existentes en `completado/`.

## Criterio de done

- Existe una especificación canónica del futuro `AGENTS.md` como entrypoint agentic del repo.
- La taxonomía de `docs/` y el lifecycle de `falta/completado/archivado` quedan definidos sin ambigüedad.
- Hay un contrato explícito para trabajo con subagentes, handoff entre sesiones y aislamiento por tarea.
- Se definen invariantes mecánicos para claridad documental, links y estructura mínima del knowledge base.
- `README.md`, `docs/plans/README.md` y los planes activos dejan de contradecirse entre sí.

## Fuentes consolidadas

- Repo actual: `README.md`, `docs/plans/README.md`, `docs/adr/`, `docs/architecture/`, `runbooks/`, `scripts/workspace-lint.mjs`.
- Históricos internos: `docs/plans/archivado/2026-04-21-falta-originales/gana-v8-harness-gap-analysis-and-closure-plan.md`.
- Referencia externa: [Web Reactiva, “Qué es el AI harness y el harness engineering”](https://www.webreactiva.com/blog/ai-harness).
- Referencia externa: [Anthropic, “Harness design for long-running application development”](https://www.anthropic.com/engineering/harness-design-long-running-apps).
- Referencia externa: [OpenAI, “Ingeniería de sistemas: Codex en un mundo centrado en agentes”](https://openai.com/es-419/index/harness-engineering/).
