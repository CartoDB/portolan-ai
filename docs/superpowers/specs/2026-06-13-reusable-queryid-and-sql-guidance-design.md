# Reusable queryId and SQL guidance

Date 2026-06-13

## Problem

A Finland "areas closest to water" session exposed three recurring AI mistakes when composing DuckDB SQL over the Portolan catalogs.

1. **queryId referenced in SQL FROM.** The AI wrote `FROM qr_1` and `FROM qr_5` three times and each failed with "Table qr_1 does not exist". A queryId is a client-side store key, not a DuckDB table, so the reuse instinct always errors.
2. **Distance measured from a whole polygon.** The first attempt computed `ST_Distance(municipality_polygon, water_polygon)`. Most Finnish municipalities physically contain or touch water, so every distance came back `0`. The first map, the first ranking and the first summary were all meaningless, and the AI narrated a confident but wrong conclusion before catching it.
3. **Wasteful recompute.** Nine queries ran, several of them the identical 142s then 59s spatial CTE, only because the AI could not reference its already-computed result. To get a different sort or a summary it recomputed the whole thing.

Mistakes 1 and 3 share one root cause. The result cannot be reused, so the AI both errors trying and recomputes wastefully. Mistake 2 is a domain reasoning gap.

## Goal

- Make a prior queryId directly queryable as a table, so `FROM qr_5` works and reads cached rows with zero recompute.
- Teach the AI the three lessons through tool descriptions and DuckDB notes so it reuses results, measures area-to-feature distance from a representative point, and computes a metric once then derives many views from it.

## Non-goals

- No change to remote query speed itself. The first heavy scan still costs what it costs. We only stop paying it repeatedly.
- No new UI. This is a services plus AI-context change.

## Part 1. Make queryId a reusable DuckDB table

### Approach, register the computed Arrow result

When `runQuery` finishes it already holds the Arrow result, and the store hands back an id like `qr_5`. Register that same Arrow result back into the shared DuckDB-WASM database as a persistent table named exactly `qr_5`. A later `SELECT * FROM qr_5` then reads cached rows and never re-touches the remote Parquet.

### Why this over the alternatives

- A `VIEW` over the original SQL would fix the error but re-run the remote scan on every reference, so it does nothing for the wasteful recompute. Rejected.
- `CREATE TABLE qr_5 AS <sql>` re-executes the heavy query at least once more, and the table name would be assigned inside `runQuery` before the store picks the final id, which fights the replay path that re-stores under a different id. Rejected.
- Registering the already-computed Arrow result reuses work already done with zero recompute, and it is keyed by the final store id, so it lines up with both fresh queries and the replay path.

Bonus, the registered table carries the auto-detected `__geo_wkb` column, so a follow-up can re-render geometry with `ST_GeomFromWKB(__geo_wkb)`, not only re-aggregate attributes.

### Mechanics

- Add a helper in `src/services/duckdb-wasm.ts`, `registerResultTable(id, arrowIPC)`. It opens a connection, drops any existing table of that id, inserts the Arrow IPC bytes as a persistent table named `id`, then closes. Persistent, not temp, so it survives the per-call connection close that `runQuery` already does.
- Insert via the DuckDB-WASM Arrow insert path that accepts IPC bytes. Reconstruct an Arrow table from `arrowIPC` if the insert API needs a table rather than raw bytes.
- Maintain an LRU set of registered ids inside `duckdb-wasm.ts`, capped near the store's 40. Drop the oldest table when the cap is exceeded so WASM memory stays bounded.
- Guard the whole helper in try-catch. A registration failure must never break the user-facing query result. On failure the queryId simply is not reusable that turn, the same as today.

### Call sites

- In `runQuery`, after `storeQueryResult(...)` returns the id at line ~472, call `registerResultTable(queryId, arrowIPC)` when `arrowIPC` is present. Do the same for the GEOMETRY Arrow fallback store at line ~579.
- In the replay path `useReplayQueries` in `src/lib/thread-hooks.ts`, after `storeQueryResultWithId(originalQueryId, stored)`, register the stored Arrow under `originalQueryId` so a restored thread is reusable under the id the components actually use. The transient table under the fresh replay id is harmless and falls out of the LRU.

### Edge cases

- Non-SELECT statements (DESCRIBE, EXPLAIN, ATTACH) produce no reusable result and are already gated by `isSelectQuery`. Do not register them.
- Empty result or missing `arrowIPC`. Skip registration, no error.
- Id reuse across a long session. The LRU drop plus drop-if-exists keeps the table name pointing at the latest result for that id.

## Part 2. Teach the AI the three lessons

All edits are text only, in `src/lib/tambo/context/duckdb-notes.ts`, the `runSQL` tool description in `src/lib/tambo/tools/run-sql.ts`, and the `geometryNote` string in `src/services/duckdb-wasm.ts`. Mirror the same changes into the project `CLAUDE.md` DuckDB rules so docs and runtime agree.

1. **Flip the queryId rule.** Replace the current "queryId is NOT a table, never use it in FROM" rule with the opposite. A prior queryId IS queryable. Write `FROM qr_5` to re-sort, re-aggregate, bin or summarize a result already computed, instead of pasting the expensive query again. Note that the table holds the result columns including auto-generated `lat` and `lng`, and `__geo_wkb` when geometry was detected.
2. **Distance from an area.** Add a rule. To measure distance from a polygon dataset such as municipalities or parcels to features, measure from a representative point with `ST_PointOnSurface(geom)`. Polygon-to-polygon distance is `0` wherever the shapes overlap, which silently turns every row into `0`.
3. **Compute once, derive many.** State the pattern. Build the heavy metric query one time, take its queryId, then derive every ranking, chart and summary from that queryId rather than rebuilding the metric each time.

### geometryNote update

The note currently says "NEVER SELECT lat/lng directly" and steers follow-ups back to the raw file. Keep the warning for queries against the raw Parquet, and add that once a queryId exists the follow-up can instead read `FROM <queryId>`, where `lat` and `lng` already exist as real columns.

## Testing

- Unit or integration test in the vitest suite. Run a simple `runQuery` over a small remote or fixture source, assert the returned queryId, then run a second `runQuery` of `SELECT count(*) FROM <queryId>` and assert it matches the first row count without error.
- Test the LRU bound. Register more than the cap and assert the oldest table name no longer resolves while recent ones do.
- Test the geometry follow-up. After a geometry query, assert `SELECT ST_AsText(ST_GeomFromWKB(__geo_wkb)) FROM <queryId> LIMIT 1` returns a value.
- Manual check. Replay the Finland water question and confirm the AI uses `FROM qr_N` for the ranking and summary, uses `ST_PointOnSurface` for distance, and does not rerun the heavy CTE.

## Risks

- WASM memory growth from materialized tables. Bounded by the per-result LIMIT and the LRU cap. Drop-on-evict keeps it in check.
- Arrow insert API shape differs across DuckDB-WASM versions. Isolate it in `registerResultTable` with a fallback, and never let it surface to the user.
