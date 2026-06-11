---
paths:
  - "src/lib/**"
---

# Lib

## `tambo/` (modular AI config)

`tamboProviderConfig` - shared base for all `TamboProvider` instances. Pages spread it and add per-catalog `tools` via `buildTools(slug)` and `contextHelpers` via `buildContextHelpers(geo, catalog, datasets)`.

### Structure

```
src/lib/tambo/
├── index.ts              # Aggregator: tamboProviderConfig + buildTools + re-exports
├── tools/                # tool registrations (1 file per tool or related group)
│   ├── index.ts          # tools[] (static) + buildTools(slug) (per-catalog)
│   ├── run-sql.ts        # runSQL - most critical, queryId pattern
│   ├── catalog-tools.ts  # makeCatalogTools(slug) → listCatalogDatasets + describeDataset
│   ├── iceberg.ts        # makeIcebergTool(slug) → attachIcebergCatalog (ATTACH 'cat' TYPE iceberg)
│   ├── question.ts       # makeQuestionTool(slug) → findDatasetsForQuestion (question-bank id → datasets)
│   ├── dashboard.ts      # dismissPanels - clear all or specific panels by type/id
│   └── export.ts         # exportCSV - download query results as CSV
├── components/           # 10 component registrations
│   ├── geo-map.ts        # GeoMap (deck.gl)
│   ├── graph.ts          # Graph (10 chart types)
│   ├── data-table.ts     # DataTable (paginated)
│   ├── time-slider.ts    # TimeSlider (time playback + cross-filter)
│   └── static.ts         # StatsCard, StatsGrid, InsightCard, DatasetCard, QueryDisplay, DataCard
├── context/              # AI context helpers (split by concern)
│   ├── index.ts          # buildContextHelpers(geo, catalog, datasets) + buildCatalogContextString
│   ├── behavior.ts       # AI behavior rules (analytical commentary, decisiveness)
│   ├── catalog-context.ts # active catalog + dataset index summary (per-catalog)
│   ├── duckdb-notes.ts   # DuckDB v1.5 WASM + catalog/iceberg/CRS rules
│   └── component-tips.ts # Component usage tips
└── suggestions.ts        # buildInitialSuggestions(geo, catalog, datasets) - per-catalog question banks
```

### Key exports
- `tamboProviderConfig` - base config (apiKey, components, tamboUrl) for all pages
- `buildTools(slug)` - static tools + per-catalog tools (catalog/iceberg/question factories)
- `buildContextHelpers(geo, catalog, datasets)` - user environment + per-catalog context (catalog datasets, behavior, DuckDB notes, component tips)
- `buildInitialSuggestions(geo, catalog, datasets)` - per-catalog question-bank chips, filtered to ids present among materialized datasets
- `components` (10 components) - aggregated array

### Editing guide
- **Add a tool**: create file in `tools/` (or a `make<Name>(slug)` factory for per-catalog tools), add to `tools` or `buildTools(slug)` in `tools/index.ts`
- **Add a component**: create file in `components/` (or add to `static.ts`), add to `components/index.ts`
- **Add AI behavior rule**: edit `context/behavior.ts`
- **Add DuckDB / catalog / iceberg / CRS rule**: edit `context/duckdb-notes.ts`
- **Tune per-catalog context**: edit `context/catalog-context.ts`
- **Add component tip**: edit `context/component-tips.ts`
- **Add a catalog question bank**: edit `CATALOG_QUESTIONS` in `suggestions.ts`
- **Tune tool description**: edit the specific tool file (affects AI routing quality)

## `use-catalog-index.ts` / `use-page-bootstrap.ts`

- `useCatalogIndex(catalog)` - loads the focused catalog's dataset index via `loadCatalogIndex`, reactive, with `{ datasets, loading, error }`. Re-loads on slug change, keeps the page usable on error.
- `usePageBootstrap(catalog?, datasets?)` - shared page bootstrap: computes `userKey`, `geo`, `contextHelpers` (`buildContextHelpers(geo, catalog, datasets)`) and `suggestions` (`buildInitialSuggestions(geo, catalog, datasets)`), and preloads DuckDB on mount.

## `thread-hooks.ts`

- `useReplayQueries(messages)` - scans thread messages for runSQL tool_use/tool_result pairs, re-runs SQL in background, stores under original queryId via `storeQueryResultWithId()`. Used by both `/chat` and `/explore`.
- `useMergeRefs()`, `useCanvasDetection()`, `usePositioning()`, `getSafeContent()`, `checkHasContent()`

## `use-geo-ip.ts`

`useGeoIP()` - fetches from `get.geojs.io/v1/ip/geo.json`, caches 24h in localStorage (null on first render). Returns `GeoIP` with city, country, lat/lng, timezone. Used for environment context (date/timezone/location), NOT for suggestions (those are catalog-specific). Gracefully returns `null` when blocked.

## `settings-store.ts`

Centralized settings store via `useSyncExternalStore` + localStorage (`walkthru-settings`). `Settings` fields: theme (`dark`/`light`/`system`) and queryLimit (default 10000). Exports: `getSettings()`, `updateSettings(partial)`, `useSettings()`, `DEFAULT_QUERY_LIMIT`, `QUERY_LIMIT_PRESETS`. Migrates from old `"theme"` localStorage key.

## `use-theme-effect.ts`

`useThemeEffect()` - reads theme from `useSettings()`, applies to `document.documentElement.classList`. Handles system media query listener for "system" mode. Called once in `App.tsx`.

## `use-anonymous-user-key.ts`

Persistent anonymous user key (localStorage `walkthru-user-key`). SDK requires `userKey` for thread scoping.

## `utils.ts`

- `cn()` - clsx + tailwind-merge
- `basePath` - `import.meta.env.BASE_URL` (from Vite `base` config, `/portolan-ai`)

## `use-url-params.ts`

`useUrlParamsSync()` - syncs `?thread=` (real `thr_` ids only) and `?q=` query params with the active thread/input. Shared by both pages.
