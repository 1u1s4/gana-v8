# Contributing

## Principios

1. El dominio vive en packages, no en apps.
2. Hermes orquesta; los workers ejecutan.
3. Todo flujo crítico debe dejar trazabilidad.
4. Ningún cambio de predicción o policy sin versionado.
5. Sandbox y replay son requisitos de diseño.

## Flujo git sugerido

- `main`
- `integration/*`
- `slice/*`

## Calidad mínima

```bash
pnpm lint
pnpm test
pnpm build
```
