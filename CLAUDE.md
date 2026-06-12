# Portolan AI

AI urban intelligence platform - natural language queries over regional Portolan catalogs (Madrid, Finland, South Africa). Each catalog publishes vector geospatial datasets (planning, cadastre, population, terrain, water, transport) as GeoParquet plus a static Iceberg surface. Built on Vite + React Router + Tambo AI + DuckDB-WASM + deck.gl.

## Commands

```bash
pnpm dev          # localhost:5173/portolan-ai
pnpm build        # production (base: /portolan-ai, output: out/, copies index.html to 404.html)
pnpm preview      # preview production build
pnpm lint         # biome check
pnpm lint:fix     # biome auto-fix
pnpm test         # vitest run
```

- **Vite** (not Next.js) - `vite.config.ts`: React plugin, `@tailwindcss/vite`, `base: "/portolan-ai"`, output to `out/`
- **React Router** - `src/App.tsx` defines 3 routes: `/` (catalog picker home), `/:slug` (explore dashboard), `/:slug/chat` (chat). The catalog `slug` comes from the URL (`madrid`, `finland`, `south-africa`)
- **Entry point**: `index.html` → `src/main.tsx` → `<BrowserRouter basename="/portolan-ai">`
- **Biome** (not ESLint) - `biome.json`: 2-space indent, double quotes, semicolons, 120 chars
- **Pre-commit**: lefthook runs `pnpx @biomejs/biome check --write` on staged files
- **Env vars**: Use `import.meta.env.VITE_*` (not `process.env.NEXT_PUBLIC_*`). Defined in `.env.local`, typed in `vite-env.d.ts`
- **No SSR**: Pure SPA, all pages are client-rendered. No `"use server"`, no API routes
- **Fonts**: Quicksand (local woff2 via `@font-face` in `globals.css`) + DM Mono (`@fontsource/dm-mono` in `main.tsx`), fully offline, no CDN
- **Lazy loading**: Use `React.lazy()` + `<Suspense>` instead of `next/dynamic`
- **Static assets**: `basePath` from `import.meta.env.BASE_URL` (set by Vite `base` config)

## Catalogs

A catalog is a region. `src/config/catalogs.ts` lists them (`CATALOGS`, `getCatalog(slug)`). Each `CatalogRef` has `slug`, `title`, `description`, `publicBase`.

| Slug | Title | Native CRS | Notes |
|------|-------|-----------|-------|
| `madrid` | Madrid | EPSG:25830 | SIGMA urban planning, housing and mobility layers (parcels, planning, tourist flats, low-emission zone, acoustic zones) |
| `finland` | Finland | EPSG:3067 | Statistics Finland areas + NLS maastotiedot topographic layers (buildings, roads, lakes, population grid, postal stats) |
| `south-africa` | South Africa | EPSG:4148 / EPSG:3857 | DLRRD cadastre, administrative, agriculture and hydrology layers |

Public base: `https://storage.googleapis.com/carto-portolan-cats/{slug}`.

### Catalog read surfaces (`src/services/catalogs/read-surfaces.ts`)

Each catalog exposes the same set of URLs, all derived from `publicBase`:

- **Datasets index** (GeoParquet): `<base>/catalog/datasets/datasets.parquet`. The discovery table, one row per dataset.
- **GeoParquet** (one dataset): `<base>/<id>/<id>.parquet`.
- **PMTiles** (one dataset, when `tiles` present): `<base>/<id>/<id>.pmtiles`.
- **Iceberg attach**: `ATTACH 'cat' (TYPE iceberg, ENDPOINT '<base>', AUTHORIZATION_TYPE 'none')`. Exposes `cat.catalog.datasets` (the index) and `cat.v3.<id>` (one table per dataset).
- **Iceberg scan** (one dataset, no attach): `iceberg_scan('<base>/data/v3/<id>/metadata/v1.metadata.json')`.

The Iceberg table references the already-published GeoParquet by absolute URI, so `read_parquet('<base>/<id>/<id>.parquet')` and `cat.v3.<id>` read the same bytes.

### Dataset index (`src/services/catalogs/`)

`loadCatalogIndex(slug, publicBase)` reads the datasets index Parquet (cached per slug). It selects the core columns by name plus the optional set via `COLUMNS('^(asset|tiles|authority|source_official_url|geometry_types)$')`, because some catalogs ship fewer columns and naming a missing column would raise a DuckDB Binder Error and break the whole load. `parseIndexRow` maps each row to a `Dataset` (`types.ts`):

`id`, `title`, `describes`, `answers` (string[] of question-bank ids), `crs`, `nFeatures`, `status`, `materialized` (`status === "materialized"`), `asset`, `tiles`, `hasTiles`, `authority`, `sourceOfficialUrl`, `geometryTypes`.

- `describeDataset(publicBase, id)` runs `DESCRIBE SELECT * FROM read_parquet('<base>/<id>/<id>.parquet')` and returns columns + a sample SQL.
- `listCatalogs()` / `resolveCatalog(slug)` wrap the static config.
- `useCatalogIndex(catalog)` (`src/lib/use-catalog-index.ts`) loads the index reactively for the focused route, with loading/error states.

### Question bank

Each catalog has a question bank: the integer ids in every dataset's `answers` column (e.g. Madrid Q1-Q10). The catalogs do NOT publish the question prose, only the ids and the dataset `describes` text that references them. `findDatasetsForQuestion(questionId)` returns the datasets whose `answers` include a given id. The user-facing question text is authored in `src/lib/tambo/suggestions.ts`.

## Architecture

**queryId pattern** (zero-token data bridge): AI calls `runSQL` → DuckDB executes → full result stored in `query-store.ts` → only `queryId` returned to LLM (~10 tokens). Components read data from store via `useQueryResult(queryId)`.

**Geometry auto-detection + CRS reprojection** (`src/services/duckdb-wasm.ts`): `runQuery({ sql, nativeCrs? })` auto-detects geometry columns via `DESCRIBE` (fast, metadata-only). Two paths: (1) native GEOMETRY type → `ST_AsWKB` + `ST_Centroid`, (2) WKB BLOB with well-known column name (geom, geometry, shape, etc.) → `ST_GeomFromWKB` + WKB passthrough. `enable_geoparquet_conversion = false` at init prevents a WASM `stoi` crash on some GeoParquet files, our wrapping handles geometry instead. When a `nativeCrs` is supplied, `wrapSqlForGeometry` reprojects the geometry to EPSG:4326 for display via `ST_Transform(geom, '<nativeCrs>', 'EPSG:4326', always_xy := true)` (`src/services/geo/crs.ts`, no-op for 4326/undefined). WKB arrays land in query-store → GeoArrow zero-copy rendering. **Synthetic lat/lng**: when geometry is auto-detected, `lat`/`lng` columns are injected, they do NOT exist in the raw Parquet file. `runQuery` returns a `geometryNote` explaining the source column. AI must use `SELECT *` (auto-wrapping re-generates lat/lng), never reference `lat`/`lng` directly on the raw file. A retry path re-wraps GEOMETRY columns with `ST_AsWKB` + `EXCLUDE` if Arrow conversion fails.

**Cross-filter bus**: Lightweight pub/sub in `query-store.ts`. Components emit/consume `bbox` (map viewport) and `value` (click) filters. Requires a shared `queryId`. **Time filter bus**: `setTimeFilter()` / `useTimeFilter()` / `applyTimeFilter()` for timestamp-based cross-filtering (TimeSlider → GeoMap snapshot + Graph reference line). **Fly-To bus**: `requestFlyTo()` / `useFlyToVersion()` / `consumeFlyTo()`. **Panel dismiss/restore bus**: `requestDismissPanel()` / `requestRestorePanel()`. **Emit guards**: `setTimeFilter` and `setCrossFilter` value-check against current state and skip emit when identical, preventing redundant subscriber re-renders that cascade into React error #185 (infinite update loop) when many panels read the same bus.

**Dashboard canvas**: Desktop = `react-grid-layout`, Touch = `@dnd-kit/sortable` (1.2s hold, grip-only drag). Panel IDs deduplicated via `Set`. State persisted to localStorage per thread: panel order (`panel-order-${threadId}`), panel layouts/sizes (`panel-layouts-${threadId}`, debounced 500ms), dismissed panels (`panel-dismissed-${threadId}`). First panel and maps always full-width. Non-first/non-map panels pair in 2-column layout. **Panel sizing**: `panelHeight()` returns grid rows per type: maps=10, graphs=5, tables=5, QueryDisplay/InsightCard/DatasetCard=3, StatsGrid/StatsCard=2. Component name is read from Tambo's `content.name` (SDK field), NOT `content.componentName`. **Edit with AI**: Pencil button on interactable panels (GeoMap, Graph, DataTable, TimeSlider). Uses `useTamboInteractable().setInteractableSelected()` to mark the component for AI focus. One-shot selection, auto-cleared when AI finishes responding.

## DuckDB Rules (for AI tool descriptions)

- **DuckDB v1.5 WASM** (Variegata). Extensions loaded at init: `httpfs`, `spatial`, `iceberg` (FORCE INSTALL from `core_nightly`). `geometry_always_xy = true` and `enable_geoparquet_conversion = false` set GLOBAL.
- **GEOMETRY is a core type** in v1.5, no `INSTALL spatial` needed to read GEOMETRY columns. `ST_AsWKB`/`ST_GeomFromWKB` are built-in. `ST_Centroid`, `ST_X`, `ST_Y`, `ST_Transform`, `ST_Intersects` use spatial (pre-loaded).
- **Prefer `SELECT *` for geometry files**. Geometry auto-detection extracts coordinates + WKB for you. Do NOT manually call `ST_AsWKB`/`ST_GeomFromWKB`/`ST_AsGeoJSON`. DESCRIBE returns `GEOMETRY('EPSG:4326')` in v1.5, detection uses `startsWith("GEOMETRY")`.
- **Native CRS**: datasets are stored in their native CRS (Madrid EPSG:25830, Finland EPSG:3067, South Africa EPSG:4148/3857). Keep the native CRS for joins, filters, attribute math and counts. Reproject to EPSG:4326 for map display only with `ST_Transform(geom, '<nativeCrs>', 'EPSG:4326', always_xy := true)`. The native CRS for each dataset is in the catalog context.
- **Two read paths, same bytes**: `read_parquet('<base>/<id>/<id>.parquet')` or, after `ATTACH 'cat' (TYPE iceberg, ENDPOINT '<base>', AUTHORIZATION_TYPE 'none')`, `cat.v3.<id>`. Discover datasets through `cat.catalog.datasets` (or the index Parquet), never guess dataset names.
- **Never guess column names**. Call `describeDataset` for an id, or run `DESCRIBE SELECT * FROM read_parquet('<base>/<id>/<id>.parquet')`, and copy exact names (e.g. `USP_TX_DEN` is exact and case sensitive). For a map or quick preview, prefer `SELECT *` with a `LIMIT` so geometry auto-renders, rather than hand-picking unverified columns.
- ONE statement per call, always use `LIMIT {queryLimit}` (user-configurable, default 10000, set via settings gear icon), HTTPS URLs in FROM.
- **Keep queries simple**: a single straightforward SELECT. Avoid LATERAL joins, UNNEST and ST_Dump, the WASM build rejects a LATERAL join whose condition is not a plain comparison. To explode multipart geometry prefer a simple function, or return the geometry as is so it renders directly.
- **Spatial filter pushdown**: row-group pruning over HTTP works only on the flat `xmin, ymin, xmax, ymax` bbox columns, never on the geometry column. To filter a viewport, predicate on those four bbox columns so DuckDB can skip row groups.
- **v1.5 syntax**: Use `lambda x: x + 1` NOT `x -> x + 1` (arrow syntax deprecated). `TRY_CAST(x AS GEOMETRY)` is broken, use `TRY(ST_GeomFromText(x))`.
- **WASM TIMESTAMPTZ limitation**: `TIMESTAMPTZ + INTERVAL` fails (no ICU extension). Cast first: `CAST(timestamp AS TIMESTAMP) + INTERVAL '72 hours'`.
- **queryId is NOT a DuckDB table**: `queryId` (e.g. `qr_1`) is a client-side store reference. NEVER use it in SQL `FROM`. Re-query the Parquet URL or `cat.v3.<id>` instead.
- **Spatial analysis**: spatial functions (ST_Buffer, ST_Intersects, ST_Contains, ST_DWithin, spatial joins) produce native GEOMETRY → results auto-render via zero-copy WKB. Just `SELECT *`. Spatial joins trigger an automatic R-tree (no index creation).
- **Geometry detection skips CTEs**. `DESCRIBE (WITH ...)` is invalid DuckDB syntax, the system wraps CTE queries as `DESCRIBE (SELECT * FROM (<sql>) __detect_geom LIMIT 0)` so GeoJSON/WFS CTE queries still auto-detect.
- **No same-name column aliasing**. `SELECT ST_AsWKB(geom) AS geom` fails in v1.5 (circular alias due to friendly SQL reusable aliases). Use a different alias like `wkb_data`.
- **GeoJSON/WFS/ArcGIS SQL patterns**: Use `read_json_auto` + `unnest(features)` + `ST_GeomFromGeoJSON` for GeoJSON FeatureCollections. **CRITICAL**: `read_json_auto` returns STRUCTs, NOT JSON strings. Rules: (1) struct dot notation (`f.id`, `f.properties.name`), JSON path operators (`f->>'$.id'`) fail in WASM. (2) `unnest(f.properties)` expands all property fields into columns, `f.properties.*` is a parser error. (3) `to_json(f.geometry)` when passing to `ST_GeomFromGeoJSON`. Pattern:
  ```sql
  WITH fc AS (
    SELECT unnest(features) AS f
    FROM read_json_auto('https://example.com/data.geojson')
  )
  SELECT f.id AS feature_id,
         unnest(f.properties),
         ST_GeomFromGeoJSON(to_json(f.geometry)) AS geometry
  FROM fc
  WHERE f.geometry IS NOT NULL
  LIMIT {queryLimit}
  ```
  For ArcGIS FeatureServer: append `/query?where=1%3D1&outFields=%2A&f=geojson&resultRecordCount=N` to the layer URL. Use `%2A` not `*` for outFields (DuckDB treats `*` in URLs as a glob and errors). Paginate large layers with `&resultOffset=`. Remote URLs must be CORS-enabled for DuckDB-WASM httpfs, servers without CORS headers silently return 0 rows.

### DuckDB Friendly SQL (use these for cleaner queries)

- **`FROM`-first syntax**: `FROM tbl` selects all columns. `FROM tbl SELECT col1, col2` also works.
- **`GROUP BY ALL`** / **`ORDER BY ALL`**: auto-infer grouping/order columns.
- **`SELECT * EXCLUDE (col)`** / **`SELECT * REPLACE (expr AS col)`**: drop or rewrite columns inline.
- **`UNION BY NAME`**: union by column names, not positions.
- **Column aliases in `WHERE`/`GROUP BY`/`HAVING`**, and **reusable aliases** earlier in the same `SELECT`. Caveat: never alias a column with the same name as the source column (circular reference).
- **`LIMIT 10%`**, **`count()`** shorthand, **trailing commas**, **dot chaining** (`'hello'.upper()`), **`PIVOT`/`UNPIVOT`**, **`ASOF` joins**, **list slicing** (`[-1]`, `[2:5]`).

## Styling Rules

- Tailwind CSS v4, dark/light via CSS variables. Font: Quicksand. Brand colors: portolan-blue, portolan-cyan, portolan-green.
- **No hardcoded colors**: use `bg-muted`, `text-foreground`, `bg-card`, etc. Never `bg-zinc-950`, `#hex`, `rgb()`, `hsl()` inline.
- **No `!important`**: use JS conditionals instead.
- Semantic classes: `text-destructive` not `text-red-500`, `text-primary` not `text-blue-500`.

## Tambo SDK (v1.2.8) - Bidirectional AI Components

Config in `src/lib/tambo/` (modular). Pages spread `tamboProviderConfig` (apiKey, components, tamboUrl) and add per-catalog `tools` via `buildTools(slug)` and `contextHelpers` via `buildContextHelpers(geo, catalog, datasets)`. Both `/:slug` and `/:slug/chat` wrap children with `<TamboMcpProvider>` (from `@tambo-ai/react/mcp`) inside `<TamboProvider>` and pass `mcpServers` from `useMcpServers()` (localStorage-backed). `usePageBootstrap(catalog, datasets)` assembles userKey, geo, contextHelpers, and suggestions. `buildInitialSuggestions(geo, catalog, datasets)` generates catalog-specific suggestion chips.

### Modular Architecture (`src/lib/tambo/`)

```
src/lib/tambo/
├── index.ts                  # Aggregator: tamboProviderConfig + buildTools + re-exports
├── tools/
│   ├── index.ts              # tools[] (static) + buildTools(slug) (per-catalog)
│   ├── run-sql.ts            # runSQL - SQL execution, queryId pattern
│   ├── catalog-tools.ts      # listCatalogDatasets + describeDataset (per-catalog)
│   ├── iceberg.ts            # attachIcebergCatalog - ATTACH 'cat' (TYPE iceberg)
│   ├── question.ts           # findDatasetsForQuestion - map question-bank id to datasets
│   ├── dashboard.ts          # dismissPanels - clear all or specific panels
│   └── export.ts             # exportCSV - download query results as CSV
├── components/
│   ├── index.ts              # Aggregates components into TamboComponent[]
│   ├── geo-map.ts            # GeoMap (deck.gl map)
│   ├── graph.ts              # Graph (10 chart types)
│   ├── data-table.ts         # DataTable (paginated)
│   ├── time-slider.ts        # TimeSlider (time playback + cross-filter)
│   └── static.ts             # StatsCard, StatsGrid, InsightCard, DatasetCard, QueryDisplay, DataCard
├── context/
│   ├── index.ts              # buildContextHelpers(geo, catalog, datasets) + buildCatalogContextString
│   ├── behavior.ts           # AI behavior rules
│   ├── catalog-context.ts    # Active catalog + dataset index summary (per-catalog)
│   ├── duckdb-notes.ts       # DuckDB v1.5 WASM + catalog/iceberg/CRS rules
│   └── component-tips.ts     # Component usage patterns
└── suggestions.ts            # buildInitialSuggestions(geo, catalog, datasets) - per-catalog question banks
```

### How Tambo Works (AI ↔ Component flow)

1. **AI generates a component**: LLM picks a registered component by name, generates props matching its Zod schema → rendered in chat or dashboard.
2. **AI updates existing component**: LLM calls `update_component_props` → `withTamboInteractable` merges them in (no re-mount).
3. **Component reads data via queryId**: AI calls `runSQL` → DuckDB executes → result stored in `query-store` → only `queryId` returned. Component calls `useQueryResult(queryId)` to read the full dataset reactively.
4. **Component emits cross-filter**: user clicks a feature/bar/row → `setCrossFilter()` → other components react via `useCrossFilter()`.

### Tools

Static (`tools`): `runSQL`, `dismissPanels`, `exportCSV`. Per-catalog (`buildTools(slug)` adds): `listCatalogDatasets`, `describeDataset`, `attachIcebergCatalog`, `findDatasetsForQuestion`. Each tool file exports a `TamboTool`, aggregated by `tools/index.ts`. The per-catalog tools are factories (`makeCatalogTools(slug)`, `makeIcebergTool(slug)`, `makeQuestionTool(slug)`) that resolve the catalog so the AI never has to pass the base URL.

### Registering Components & Tools

```ts
// Component (src/lib/tambo/components/my-widget.ts):
export const myWidgetComponent: TamboComponent = {
  name: "MyWidget",                         // AI references this name
  description: "When/how AI should use it", // Critical for AI routing
  component: InteractableMyWidget,          // withTamboInteractable-wrapped
  propsSchema: myWidgetSchema,              // Zod schema with .describe() on every field
};

// Tool (src/lib/tambo/tools/my-tool.ts):
export const myToolTool: TamboTool = {
  name: "myTool",
  description: "What this tool does",
  tool: functionRef,
  inputSchema: z.object({...}),
  outputSchema: z.object({...}),
};
```

### Making a Component Interactable (AI can update props at runtime)

```ts
export const mySchema = z.object({
  queryId: z.string().optional().describe("ID from runSQL result"),
  title: z.string().optional().describe("Display title"),
});

export const MyComponent = React.forwardRef<HTMLDivElement, MyProps>((props, ref) => {
  const queryResult = useQueryResult(props.queryId); // reactive data
  const crossFilter = useCrossFilter();              // optional
  return <div ref={ref}>...</div>;
});

export const InteractableMyComponent = withTamboInteractable(MyComponent, {
  componentName: "MyComponent",
  description: "What AI can do: 'When user says X, update Y prop'",
  propsSchema: mySchema,
});
```

### Key Rules

- **`_tambo_*` props**: Components receive hidden props (`_tambo_componentId`, etc.). Never spread `{...props}` onto DOM elements.
- **Zod constraints**: No `z.record()`, `z.map()`, `z.set()`. Always `.describe()` every field. Array items need an `id` field.
- **`useQueryResult(queryId)`** (reactive via `useSyncExternalStore`). NOT `getQueryResult()` (won't re-render on thread replay).
- **DO NOT use `useTamboComponentState`** with `withTamboInteractable`. Causes "setState during render". Use `propsSchema` for all AI-controlled state.
- **DO NOT use `useTamboInteractable()` or `useTamboCurrentComponent()`** inside a `withTamboInteractable`-wrapped component. Same setState conflict.
- **NEVER call setState during render** in wrapped components or in components that mount/unmount interactable children (e.g. DashboardCanvas). Use `useEffect` or `queueMicrotask`. Direct setState in render causes "Cannot update TamboRegistryProvider while rendering TamboInteractableProvider".
- **Render-loop safeguards (React #185)**: (1) Never spread a fresh array into `useMemo`/`useEffect` deps. Wrap arrays in `useMemo` so slots stay reference-stable. (2) `useEffect` blocks that `setState(new Map())` / `setState([...])` unconditionally churn allocations, guard with functional updates + equality. (3) Pub/sub emitters (`setTimeFilter`, `setCrossFilter`) MUST value-check before emitting. (4) Read `content.name` (SDK raw field) NOT `content.componentName`.
- **`useInDashboardPanel()`**: Components check if they're in a dashboard panel to hide redundant headers.
- **Run ID desync**: `invalid_previous_run` error → auto `startNewThread()` to escape the error loop.

### Current Interactable Components

| Component | AI Can Update | Data Source | Cross-Filter |
|-----------|--------------|-------------|--------------|
| **GeoMap** | latitude, longitude, zoom, pitch, bearing, colorScheme, extruded, layerType, layers[] | queryId → useQueryResult | Emits: feature click, bbox. Consumes: bbox, time filter |
| **Graph** | chartType, xColumn, yColumns, xLabel, yLabel | queryId → useQueryResult | Emits: bar click. Consumes: bbox (filters rows), time filter (reference line) |
| **DataTable** | visibleColumns, title | queryId → useQueryResult | Emits: row click. Consumes: bbox |
| **TimeSlider** | queryId, timestampColumn, title, autoplay, intervalMs, timezone | queryId → useQueryResult | Emits: time filter (timestamp index). Cross-filters GeoMap + Graph |

### Static Components (AI sends all props, no runtime updates)

StatsCard, StatsGrid, InsightCard, DatasetCard, QueryDisplay, DataCard. AI provides all values inline.

### Graph Chart Types

10 chart types: `bar`, `line`, `area`, `pie`, `scatter`, `radar`, `radialBar`, `treemap`, `composed` (bar+line overlay), `funnel`. Always set `xLabel` and `yLabel`. Y-axis auto-formats large numbers (5000→5k). Legend renders at top.

### UPDATE vs CREATE NEW Components

**Default: Always CREATE NEW** components with a fresh queryId. Every new question gets its own panels, building a dashboard history. **Only UPDATE existing** (`update_component_props`) when the user clicked the "Edit with AI" pencil on a panel (component has `isSelected: true`) AND their message modifies that panel (zoom, pitch, colors, chart type, hide columns, filter). If no component is selected, always create new panels.

### Multi-Layer GeoMap

`layers` array prop (max 5). Each layer: `{ id, queryId, layerType, valueColumn, ..., colorScheme, opacity, visible }`. Floating layer control panel (top-left) shown when any layers exist, for toggle/opacity/reorder. Layer-control state persists to localStorage (`geomap-layers:{threadId}:{queryId|layerIds}`) as slim `LayerOverride` entries (`{ id, visible, opacity }` + order) merged field-wise onto the live AI layers, so AI restyling (colorScheme, columns, layerType) is never shadowed by a user toggle. Single-layer maps synthesize a `LayerEntry` from direct props. Map viewport persisted to localStorage (`geomap-viewport:{threadId}:{queryId|layerIds}`), only user gestures saved, AI flyTo/fitBounds suppressed via `programmaticMoveRef`. Keys are thread-scoped because queryIds (`qr_N`) are session counters that would otherwise collide across sessions. **AI camera precedence**: when AI updates latitude/longitude/zoom/pitch/bearing props, the saved user viewport is cleared so the update applies (otherwise one user gesture would shadow AI camera changes forever). DeckGLMap also eases pitch/bearing when they change without a lat/lng/zoom change (AI setting `extruded` or `pitch` alone), so 3D mode applies live instead of waiting for a remount. Uses 5 fixed `useQueryResult` hook slots (React hooks can't be called conditionally).

### Adding a New Bidirectional Component (checklist)

1. Define Zod schema in the component file. `.describe()` every field, use `queryId` for data.
2. Build with `React.forwardRef`, use `useQueryResult(queryId)` for data, `useCrossFilter()` if needed.
3. Wrap with `withTamboInteractable(Component, { componentName, description, propsSchema })`.
4. Create a registration file in `src/lib/tambo/components/` (or add to `static.ts`).
5. Import and add to the array in `src/lib/tambo/components/index.ts`.
6. Write a `description` that tells AI exactly when to use it and what props to update for common requests.
7. If it needs tools, create a tool file in `src/lib/tambo/tools/` and add to `tools/index.ts`.

## Expanding the Platform

### Adding a New Catalog

1. Add a `CatalogRef` to `CATALOGS` in `src/config/catalogs.ts` (`slug`, `title`, `description`, `publicBase`).
2. Confirm the catalog publishes `catalog/datasets/datasets.parquet` and per-dataset GeoParquet at `<base>/<id>/<id>.parquet` (and Iceberg metadata under `data/v3/<id>/metadata/`).
3. Add a per-catalog question bank to `CATALOG_QUESTIONS` in `src/lib/tambo/suggestions.ts` (friendly text per `answers` id). Catalogs with no bank fall back to dataset-title chips automatically.
4. Update the Catalogs table in `CLAUDE.md`.

### Adding a New Tool

1. Create a tool file in `src/lib/tambo/tools/<name>.ts`. Export a `TamboTool` (or a `make<Name>(slug)` factory for per-catalog tools).
2. Add it to `tools` (static) or `buildTools(slug)` (per-catalog) in `src/lib/tambo/tools/index.ts`.
3. Keep the description lean (~3 lines). Detailed rules go in `src/lib/tambo/context/duckdb-notes.ts`.

### Tuning AI Behavior

- **AI personality/decisiveness**: `src/lib/tambo/context/behavior.ts`
- **DuckDB + catalog/iceberg/CRS rules**: `src/lib/tambo/context/duckdb-notes.ts`
- **Component usage patterns**: `src/lib/tambo/context/component-tips.ts`
- **Per-catalog context (datasets, native CRS, answers)**: `src/lib/tambo/context/catalog-context.ts`
- **Suggestion chips / question banks**: `src/lib/tambo/suggestions.ts`
- **Tool descriptions** (AI routing): the specific tool file in `src/lib/tambo/tools/`
- **Component descriptions** (AI routing): the specific file in `src/lib/tambo/components/`

## GeoArrow Zero-Copy Rendering

Map layers use `@geoarrow/deck.gl-geoarrow` + `@walkthru-earth/objex-utils` for zero-copy Arrow → GPU rendering. Pipeline:

```
DuckDB-WASM → Arrow Table → columnArrays (typed array views) + arrowIPC (bytes) + wkbArrays
  → stored in query-store alongside JS rows
  → GeoMap reads columnArrays/wkbArrays → builds GeoArrow Table (makeData/makeVector, no copy for Float64)
  → GeoArrow layers render directly from Arrow buffers
```

- **WKB/native geometry** (the common case for catalog data): `@walkthru-earth/objex-utils` `buildGeoArrowTables()` reads WKB binary directly into pre-allocated Float64Array → Arrow Table. Supports point, linestring, polygon, multi* geometries. No GeoJSON parsing, no intermediate JS objects.
- **Scatterplot**: `buildPointGeomVector()` interleaves lat/lng into `Float64Array(2*N)`, wraps as `FixedSizeList(2, Float64)`.
- **Arc**: `buildGeoArrowArcTable()` - source/target point geometry columns.
- **H3 / A5**: deck.gl `H3HexagonLayer` / `A5Layer` generate cell polygons on the GPU from `hex` / `pentagon` strings. Available layer types, but Portolan catalog datasets are vector features (not DGGS-indexed), so the WKB path is what renders them.
- **Fallback**: if `columnArrays`/`wkbArrays` are missing, falls back to standard deck.gl layers with JS object data.

Layer types: `h3`, `a5`, `scatterplot`, `geojson`, `arc`, `wkb`. **Auto-routing** (`detectLayerType()`): `pentagon`/`a5_cell`/`a5_index` → a5, `hex`/`h3_index` → h3, `source_lat`+`dest_lat` → arc, `lat`/`lng` → scatterplot, `geometry`/`geojson` → geojson. The WKB path takes priority when `wkbArrays` is present (geometry auto-detected). Spatial analysis results auto-render via the WKB path.

Packages: `@geoarrow/deck.gl-geoarrow@0.4.1`, `@walkthru-earth/objex-utils@1.5.0`, `apache-arrow@21.1.0`, `hyparquet@1.26.0`.

## @Mention System

Mentions use `@type:id` format in chat input, rendered as colored chip pills above the textarea via `MentionChips` (`src/components/tambo/mention-chips.tsx`).

| Type | Mechanism | Page | References |
|------|-----------|------|------------|
| `@panel` | Context attachment + chip (no text token) | `/:slug` (explore) | Dashboard panel (via `@` button on panel header) |

**Panel mentions** (`/:slug`): the `@` button writes NOTHING into the textarea. It adds a one-shot context attachment (`useTamboContextAttachment`) carrying the panel snapshot (componentName, title, queryId, row count, columns, sample rows via `buildPanelSnapshot` in `panel-store.ts`). `MentionChips` renders chips directly from `attachments` (filtered to `type === "panel"`, labeled by `displayName`), NOT by parsing input text. Chip × calls `removeContextAttachment(id)`; the SDK auto-clears attachments after send. A `panelId → attachmentId` ref map dedupes repeat clicks and is pruned when attachments change. This design exists because the SDK (v1.2.8) does not resolve `@type:id` text into resource fetches on send, and raw tokens in a plain textarea are noisy UX.

**Panel resources** (`/:slug`): `listResources`/`getResource` on `TamboProvider` expose active dashboard panels as `panel://ComponentName/panelId` resources for the resource picker dropdown. `DashboardCanvas` syncs panel info to `panel-store.ts`. A panel resource includes queryId, row count, columns, and sample rows. Mentions are user-initiated references to existing UI elements, tools are AI-callable functions, and datasets are reached through tools (`listCatalogDatasets`, `describeDataset`) because the AI composes SQL around them.

## Conventions

- Never show "Tambo", "DuckDB", "Parquet", "Iceberg", "deck.gl" in the UI.
- **Settings**: Gear icon (`<SettingsButton />`) on both pages, popover with theme toggle and query limit (presets 500/5K/10K/50K + custom 100-100000). Portal to `document.body` to avoid header backdrop-blur transparency. Stored in `settings-store.ts` (localStorage `portolan-settings`), fields: `theme`, `queryLimit`.
- Theme: system detection on first visit, settings popover cycles Dark/Light/System. `useThemeEffect()` applies it in `App.tsx`.
- Map basemap: CARTO Dark Matter / Positron, always forced to `auto` (follows the user's theme). AI basemap prop is ignored.
- **Thread delete**: thread history dropdown (Trash icon + inline confirm). `client.threads.delete(threadId, { userKey })`. **Thread rename**: inline edit (Pencil icon). `client.threads.update(threadId, { userKey, name })`.
- Thread URLs: `?thread=threadId` only for real IDs (prefix `thr_`). Shared `?q=` + `?thread=` sync via `useUrlParamsSync()`.
- Plain `<textarea>` for all text input (no TipTap/rich-text).
- AI must NEVER render checkboxes or selectable lists. Users cannot submit selections. Use DatasetCard components + auto-submitting suggestion chips instead.
- Geo-IP: `useGeoIP()` fetches from geojs.io, caches 24h in localStorage (null on first render). Returns city, country, lat/lng, timezone. Used for environment context, NOT for suggestions (suggestions are catalog-specific). Falls back gracefully when blocked.
- Query replay: `useReplayQueries(messages)` re-runs SQL from restored threads to repopulate query-store. Used by both pages.
- GeoMap height: `h-[420px]` in chat (inline), `h-full` in dashboard panels.
- Anonymous user key: `useAnonymousUserKey()` (localStorage `walkthru-user-key`), required by the SDK for thread scoping.
