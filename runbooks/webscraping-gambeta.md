# Webscraping Gambeta

Runner repo-local para hacer un scraping HTML simple y persistir el resultado en una base MySQL aislada.

## Base de datos

Base recomendada:

- `webscraping_gambeta`

El runner crea la base si recibe `DATABASE_ADMIN_URL` y aplica el schema de:

- `scripts/webscraping-gambeta/schema.sql`

Tablas:

- `scrape_runs`: una fila por corrida
- `scraped_pages`: una fila por URL scrapeada dentro de una corrida

## Uso

```bash
DATABASE_ADMIN_URL='mysql://...' \
WEBSCRAPING_TARGET_URLS='https://example.com,https://example.org' \
node scripts/webscraping-gambeta/run.mjs
```

Opciones:

- `WEBSCRAPING_DATABASE_NAME=webscraping_gambeta` para cambiar el nombre de la base
- `WEBSCRAPING_DATABASE_URL=mysql://.../webscraping_gambeta?...` si la base ya existe y no querés usar admin URL
- `WEBSCRAPING_KEEP_RAW_HTML=1` o `--keep-raw-html` para persistir HTML crudo en `scraped_pages.raw_html`
- `--urls=https://a.com,https://b.com` como alternativa a `WEBSCRAPING_TARGET_URLS`

## Verificación rápida

```bash
node --test tests/webscraping-gambeta.test.mjs
```

Smoke real contra DigitalOcean:

```bash
DATABASE_ADMIN_URL='mysql://...' \
WEBSCRAPING_TARGET_URLS='https://example.com' \
node scripts/webscraping-gambeta/run.mjs
```

Luego validar en MySQL:

```sql
SELECT COUNT(*) FROM webscraping_gambeta.scrape_runs;
SELECT COUNT(*) FROM webscraping_gambeta.scraped_pages;
```
