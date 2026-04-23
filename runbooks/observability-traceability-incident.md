# Observability Incident

## Objetivo

Investigar incidentes donde `health`, `readiness`, `operational-summary` u `operational-logs` dejan de ser suficientes o empiezan a divergir del estado real del harness.

## Disparadores

- `public-api` reporta `blocked` o `review` sin explicación suficiente.
- Hay contradicción entre `health`, `readiness`, `policy` y la cola real.
- El operador no puede reconstruir un incidente con la evidencia disponible.

## Precondiciones

- `public-api` disponible y apuntando al entorno afectado.
- Saber si el incidente es local, CI o runtime real sobre MySQL.
- Tener clara la ventana temporal a inspeccionar.

## Comandos

1. Levantar o consultar `public-api`:

```bash
pnpm --filter @gana-v8/public-api serve
```

2. Capturar las lecturas operativas mínimas:

```bash
curl -s http://127.0.0.1:${GANA_PUBLIC_API_PORT:-3100}/health
curl -s http://127.0.0.1:${GANA_PUBLIC_API_PORT:-3100}/readiness
curl -s http://127.0.0.1:${GANA_PUBLIC_API_PORT:-3100}/operational-summary
curl -s http://127.0.0.1:${GANA_PUBLIC_API_PORT:-3100}/operational-logs
```

3. Si el incidente parece de runtime durable, rerun del gate de base de datos:

```bash
pnpm db:generate
pnpm db:migrate:deploy
pnpm --filter @gana-v8/control-plane-runtime test
```

## Evidencia esperada

- Snapshot consistente de `health`, `readiness`, `operational-summary` y `operational-logs`.
- Identificación de si el problema es falta de señal durable, lectura inconsistente o bug real del runtime.
- Correlación básica entre tasks, retries, quarantine/redrive y promotion state.

## Decisiones humanas

- Si las lecturas coinciden y apuntan a un incidente real, seguir el runbook específico del frente afectado.
- Si las lecturas divergen, tratarlo como gap del plan activo y no como fallo aislado del operador.
- Si la evidencia disponible no alcanza para explicar el incidente, bloquear promoción y abrir follow-up de observabilidad durable.

## Salida

- Incidente clasificado con evidencia mínima capturada, o bloqueo explícito por falta de observabilidad durable.
