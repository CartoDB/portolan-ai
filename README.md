# Portolan AI

Portolan AI is a catalog-aware conversational AI explorer for CARTO Portolan catalogs. It discovers datasets from each catalog's published index and queries them in the browser with DuckDB-wasm over the GCS GeoParquet and static Iceberg v3 read surfaces, rendering the results as maps, tables, and charts.

## How It Works

Portolan AI is a static single-page app with no required backend. The URI path selects the catalog, for example `/madrid`, `/finland`, or `/south-africa`, and that choice scopes the AI context to a single catalog. The AI discovers the catalog's datasets from its published index, then runs SQL in the browser with DuckDB-wasm directly against the GeoParquet and static Iceberg v3 surfaces on GCS. No data passes through the model, and no server is needed.

## Getting Started

```bash
pnpm install
cp example.env.local .env.local   # then set your keys
pnpm dev
```

Set `VITE_TAMBO_API_KEY` and `VITE_TAMBO_URL` in `.env.local` before starting the dev server. Use `pnpm build` for the static production build, written to `out/`. Use `pnpm test` to run the unit tests.

## Environment Variables

| Variable | Required | Description |
|----------|----------|-------------|
| `VITE_TAMBO_API_KEY` | Yes | Tambo AI API key |
| `VITE_TAMBO_URL` | Yes | Tambo API URL |
| `VITE_POSTHOG_KEY` | No | Optional PostHog analytics key |
| `VITE_POSTHOG_HOST` | No | Optional PostHog host |

## Catalog Routing

The route `/` is the catalog picker, where you choose which Portolan catalog to explore. A `/<slug>` route, such as `/madrid`, is the focused explorer for that one catalog, with the AI context scoped to its datasets.

## Optional MotherDuck

The MCP config modal includes an optional MotherDuck quick-add preset. The default query path stays in-browser on DuckDB-wasm, and the preset routes heavier queries to MotherDuck cloud instead. You supply your own MotherDuck endpoint and token, nothing is configured by default.

## Credits

Portolan AI is built on the [walkthru.earth](https://walkthru.earth) AI explorer by walkthru.earth, adapted for CARTO Portolan catalogs by CARTO. Credit and thanks to both walkthru.earth and CARTO.
