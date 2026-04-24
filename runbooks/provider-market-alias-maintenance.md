# Provider market alias maintenance

## Objetivo

Mantener la normalizacion de mercados de odds cuando API-Football cambia nombres o IDs de bets. El contrato vigente es: un nombre reconocido gana sobre un ID fragil; el ID queda como fallback compatible para payloads legacy o incompletos.

## Superficie canonica

- Tabla de aliases: `packages/source-connectors/src/markets.ts`.
- Corpus sintetico/sanitizado esperado: `packages/source-connectors/tests/fixtures/api-football-market-aliases.json`.
- Tests focales: `packages/source-connectors/tests/markets.test.ts` y `packages/source-connectors/tests/api-football-client.test.ts`.

## Procedimiento

1. Confirmar el mercado canonico afectado: `h2h`, `totals-goals`, `both-teams-score`, `double-chance`, `corners-total` o `corners-h2h`.
2. Agregar el nombre observado en `nameAliases` del canonical market correcto. Normalizarlo en minusculas como lo entrega el proveedor despues de trim.
3. Agregar el ID solo si hay evidencia de que sigue siendo estable o si se necesita compatibilidad con payloads historicos.
4. Si el nombre observado es sensible o viene de evidencia live, sanitizarlo antes de agregarlo al fixture JSON; el fixture debe conservar la forma semantica, no datos de clientes ni cuentas.
5. Cubrir el caso en tests. Incluir conflicto nombre/ID cuando el cambio demuestre que el nombre debe ganar.

## Validacion barata

```bash
pnpm --filter @gana-v8/source-connectors test
```

No mover el plan activo de provider market aliases a completado solo con este mantenimiento. El cierre requiere evidencia live real del proveedor, no solo corpus sintetico.
