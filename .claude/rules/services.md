---
paths:
  - "src/services/**"
---

# Services

## `duckdb-wasm.ts`

- `initDuckDB()`: singleton, jsDelivr bundles, Blob URL worker, extensions: httpfs → spatial → iceberg (FORCE INSTALL from `core_nightly`), `geometry_always_xy = true`, `enable_geoparquet_conversion = false` (both GLOBAL), retries 3x
- `preloadDuckDB()`: non-blocking warmup on page mount
- `runQuery({ sql, nativeCrs? })` (also accepts a bare `sql` string): cleanSql → detectGeometryColumns (DESCRIBE) → wrapSqlForGeometry (if GEOMETRY/WKB found, reprojects from `nativeCrs` to EPSG:4326 for display) → execute → Arrow→JS rows + columnArrays (typed array views) + arrowIPC (bytes) + wkbArrays (if geometry) → store in query-store → return metadata + 3 sample rows + `geometryNote` (if geometry detected)
- `detectGeometryColumns(conn, sql)`: runs `DESCRIBE (sql)`, checks column_type for GEOMETRY (`startsWith("GEOMETRY")`) or WKB BLOB with well-known geo names. CTE queries wrapped as `DESCRIBE (SELECT * FROM (WITH...) __detect_geom LIMIT 0)` to enable detection for GeoJSON/WFS queries. Fast, reads Parquet metadata only.
- `wrapSqlForGeometry(sql, geomCol, cols, isNativeGeometry, nativeCrs?)`: wraps as `SELECT __src.* EXCLUDE ("geomCol"), ST_Y(ST_Centroid(geom)) AS lat, ST_X(ST_Centroid(geom)) AS lng, ST_AsWKB(geom) AS __geo_wkb FROM (sql) __src`, where `geom` is `"col"` for native GEOMETRY or `ST_GeomFromWKB("col")` for WKB BLOB, and is wrapped in `transform4326Expr(...)` (`src/services/geo/crs.ts` → `ST_Transform(geom, '<nativeCrs>', 'EPSG:4326', always_xy := true)`) when `nativeCrs` is set. EXCLUDE prevents DuckDB-WASM "Unsupported type in Arrow Conversion: GEOMETRY" crash (#2187). Skips lat/lng if they already exist. **lat/lng are synthetic**, they do NOT exist in the raw file.
- **GEOMETRY Arrow fallback**: If query execution fails with GEOMETRY Arrow error, runQuery retries with all GEOMETRY columns converted to WKB via `ST_AsWKB()` and excluded from `SELECT *`.
- `registerRemoteJSON(url, name)`: fetches remote JSON via browser `fetch`, registers as virtual file in DuckDB-WASM via `registerFileBuffer`. Returns virtual path `/remote/{name}.geojson`. Used by ArcGIS tool to bypass httpfs truncation. Cached per URL, subsequent calls return same path.
- `arrowToJs(val)`: BigInt→Number, Uint8Array→hex, Struct→recursive .toJSON() (converts nested BigInts), plain objects→recursive, Array→recursive
- Column arrays extracted via `vec.toArray()`, zero-copy views for single-chunk results. Used by GeoArrow layers for map rendering.

## `query-store.ts`

- `Map<string, StoredQuery>`, keeps last 20 results (auto-ID) or 40 (specific ID). `StoredQuery` has `rows` (JS objects), `columnArrays` (typed arrays for GeoArrow), `arrowIPC` (IPC bytes), `wkbArrays` (Uint8Array[] for auto-detected geometry), `geometryColumn` (name of detected geom col).
- `storeQueryResult()` → auto-incremented `qr_N` ID (evicts oldest beyond 20)
- `storeQueryResultWithId(id, result)` → specific ID for thread replay (evicts oldest beyond 40)
- `useQueryResult(queryId)` - `useSyncExternalStore` reactive hook. Components MUST use this, not `getQueryResult()`
- Cross-filter: `setCrossFilter()` / `useCrossFilter()`. Types: `value` (click), `bbox` (viewport). Toggle via `setCrossFilterEnabled()`. **Emit guard**: `setCrossFilter` value-checks against `currentFilter` (source, type, column, queryId, values) and SKIPS emit when unchanged. Prevents map viewport bbox spam from cascading into GeoMap/DataTable/Graph re-renders.
- Fly-To Bus: `requestFlyTo({ latitude, longitude, zoom? })` → `useFlyToVersion()` triggers re-render → `consumeFlyTo()` returns target once. Used by DataTable "Zoom to record" → DeckGLMap `flyTo()` (sets `programmaticMoveRef` to suppress viewport save). Lightweight version-based pub/sub (same pattern as cross-filter).
- Time Filter Bus: `setTimeFilter({ timestamps, currentIndex, timestampColumn, sourceComponent })` → `useTimeFilter()` reactive hook → `applyTimeFilter(rows, filter, selfComponent)` filters rows matching current timestamp. `clearTimeFilter()` on TimeSlider unmount. Used for time playback over any timestamped dataset: TimeSlider emits → GeoMap shows spatial snapshot, Graph shows reference line. **Emit guard**: `setTimeFilter` value-checks against `currentTimeFilter` (index, column, source, timestamps ref) and SKIPS emit when identical. TimeSlider also keeps a `lastEmittedRef` to skip redundant `setTimeFilter` calls triggered by effect re-runs.
- Panel Dismiss Bus: `requestDismissPanel(target)` → `useDismissVersion()` triggers re-render → `consumeDismissRequest()` returns `{ target }` once. target: `"all"` clears everything, or component type name (e.g. `"GeoMap"`, `"Graph"`) for selective dismiss. Used by `dismissPanels` AI tool → DashboardCanvas matches target against `panel.componentName` (sourced from Tambo `content.name`, case-insensitive) or exact `panelId`. Same version-based pub/sub pattern as fly-to.
- Panel Restore Bus: `requestRestorePanel(target)` → `useRestoreVersion()` triggers re-render → `consumeRestoreRequest()` returns `{ target }` once. Restores previously dismissed panels.
- Dismissed Panel IDs: `syncDismissedPanelIds(Set<string>)` called by DashboardCanvas → `isPanelDismissed(id)` / `useDismissedPanelIds()` reactive read-only access.

## `export.ts`

- `exportQueryToCSV({ queryId, filename? })`: reads `StoredQuery` from query-store, builds RFC 4180 CSV (proper escaping), triggers browser download via Blob URL. Used by AI `exportCSV` tool and DataTable footer button. Returns `{ success, rowCount, filename }`.

## `panel-store.ts`

- Lightweight registry of active dashboard panels. `DashboardCanvas` syncs panel info here on every render.
- `syncActivePanels(panels)` - called by DashboardCanvas when panels change
- `getActivePanels()` - non-reactive read for resource listing
- `PanelEntry`: `{ id, componentName, title, queryId? }`
- Used by explore page's `listResources`/`getResource` to expose panels as `panel://ComponentName/panelId` resources for @-mentions.

## `geo/` - CRS helpers

- `geo/crs.ts` → `transform4326Expr(geomExpr, nativeCrs?)`: returns `geomExpr` unchanged for EPSG:4326/undefined, otherwise `ST_Transform(geomExpr, '<nativeCrs>', 'EPSG:4326', always_xy := true)`. Used by `wrapSqlForGeometry` to reproject native-CRS catalog geometry for display only.

## `catalogs/` - Portolan catalog data layer

Each catalog (Madrid, Finland, South Africa) is a region defined in `src/config/catalogs.ts` (`CATALOGS`, `getCatalog(slug)`, `CatalogRef`: `slug`, `title`, `description`, `publicBase`). The service reads the published GeoParquet + static Iceberg surface, there are no bundled dataset modules.

- `read-surfaces.ts` - URL builders from `publicBase`:
  - `datasetsIndexUrl(base)` → `<base>/catalog/datasets/datasets.parquet` (discovery index)
  - `geoparquetUrl(base, id)` → `<base>/<id>/<id>.parquet`
  - `pmtilesUrl(base, id)` → `<base>/<id>/<id>.pmtiles`
  - `icebergAttachSql(base, alias='cat')` → `ATTACH '<alias>' (TYPE iceberg, ENDPOINT '<base>', AUTHORIZATION_TYPE 'none')` → exposes `cat.catalog.datasets` + `cat.v3.<id>`
  - `icebergScanSql(base, id)` → `iceberg_scan('<base>/data/v3/<id>/metadata/v1.metadata.json')`
- `load-index.ts` → `loadCatalogIndex(slug, base)`: reads the index Parquet (cached per slug). Selects core columns by name plus the optional set via `COLUMNS('^(asset|tiles|authority|source_official_url|geometry_types)$')`, because some catalogs ship fewer columns and naming a missing one raises a DuckDB Binder Error. Orders materialized first, then by `n_features`.
- `parse-index.ts` → `parseIndexRow(raw)`: maps a `RawIndexRow` to a `Dataset`. `answers` and `geometry_types` coerce to `string[]`, `materialized = status === "materialized"`, `hasTiles = Boolean(tiles)`.
- `types.ts` → `Dataset` (`id`, `title`, `describes`, `answers`, `crs`, `nFeatures`, `status`, `materialized`, `asset`, `tiles`, `hasTiles`, `authority`, `sourceOfficialUrl`, `geometryTypes`) + `RawIndexRow`.
- `describe-dataset.ts` → `describeDataset(base, id)`: runs `DESCRIBE SELECT * FROM read_parquet('<base>/<id>/<id>.parquet')`, returns `{ columns: {name,type}[], sampleSql }`.
- `list-catalogs.ts` → `listCatalogs()` / `resolveCatalog(slug)` over the static config.
- `index.ts` re-exports all of the above plus the `Dataset` type.

**Question bank**: the integer ids in each dataset's `answers` reference a per-catalog question bank. The prose is NOT published, only the ids and the `describes` text. The Tambo `findDatasetsForQuestion` tool maps an id back to datasets, the friendly question text lives in `src/lib/tambo/suggestions.ts`.
