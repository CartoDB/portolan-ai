# Reusable queryId and SQL guidance Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make a prior `queryId` a real, reusable DuckDB-WASM table so `FROM qr_5` reads cached rows with zero recompute, and teach the AI to reuse results, measure area-to-feature distance from a representative point, and compute a metric once then derive many views.

**Architecture:** When `runQuery` finishes, the freshly computed Arrow result is registered back into the shared DuckDB-WASM database as a persistent table named after its store id, bounded by a pure LRU. A small set of text edits in the AI context, the `runSQL` tool, the `geometryNote`, and `CLAUDE.md` deliver the three lessons. The DuckDB v1.5.3 CLI validates SQL semantics that the browser-only WASM engine cannot exercise in vitest.

**Tech Stack:** TypeScript, DuckDB-WASM v1.5 (`@duckdb/duckdb-wasm`), apache-arrow 21, Vitest (node env), Biome, DuckDB CLI v1.5.3.

---

## File structure

- Create `src/services/registered-tables.ts`, pure LRU bookkeeping for table ids registered under queryIds. One responsibility, fully unit-testable in node.
- Create `src/services/registered-tables.test.ts`, unit tests for the LRU helper.
- Modify `src/services/duckdb-wasm.ts`, add `registerResultTable`, call it from both store paths in `runQuery`, update the `geometryNote` string.
- Modify `src/lib/tambo/thread-hooks.ts` (file is `src/lib/thread-hooks.ts`), register the replayed result under the original queryId.
- Modify `src/lib/tambo/context/duckdb-notes.ts`, add the three lessons to the runtime AI context.
- Create `src/lib/tambo/context/sql-guidance.test.ts`, assert the three lessons appear in the assembled context.
- Modify `src/lib/tambo/tools/run-sql.ts`, point the description at the new reuse rule.
- Modify `CLAUDE.md`, flip the "queryId is NOT a table" rule and add the distance lesson.
- Create `scripts/validate-sql-guidance.sql`, a CLI script proving the distance fix and the table-reuse concept.

---

## Task 1: Pure LRU helper for registered tables

**Files:**
- Create: `src/services/registered-tables.ts`
- Test: `src/services/registered-tables.test.ts`

- [ ] **Step 1: Write the failing test**

```ts
// src/services/registered-tables.test.ts
import { describe, expect, it } from "vitest";
import { touchLru } from "./registered-tables";

describe("touchLru", () => {
  it("appends a new id as most-recent with nothing to evict under cap", () => {
    expect(touchLru([], "qr_1", 3)).toEqual({ next: ["qr_1"], evict: [] });
  });

  it("evicts the oldest id when the cap is exceeded", () => {
    expect(touchLru(["qr_1", "qr_2", "qr_3"], "qr_4", 3)).toEqual({
      next: ["qr_2", "qr_3", "qr_4"],
      evict: ["qr_1"],
    });
  });

  it("re-touching an existing id moves it to most-recent and evicts nothing", () => {
    expect(touchLru(["qr_1", "qr_2", "qr_3"], "qr_1", 3)).toEqual({
      next: ["qr_2", "qr_3", "qr_1"],
      evict: [],
    });
  });

  it("never evicts the id being touched, even when the cap is smaller than the backlog", () => {
    const result = touchLru(["qr_1", "qr_2"], "qr_3", 1);
    expect(result.next).toEqual(["qr_3"]);
    expect(result.evict).toEqual(["qr_1", "qr_2"]);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm test -- src/services/registered-tables.test.ts`
Expected: FAIL with "Cannot find module './registered-tables'" or "touchLru is not a function".

- [ ] **Step 3: Write minimal implementation**

```ts
// src/services/registered-tables.ts
/**
 * Pure LRU bookkeeping for DuckDB-WASM tables registered under queryIds.
 * `order` is oldest-first. Touching an id moves it to most-recent and returns
 * the ids that fall out of the cap so the caller can DROP those tables.
 */
export function touchLru(order: string[], id: string, cap: number): { next: string[]; evict: string[] } {
  const without = order.filter((existing) => existing !== id);
  const appended = [...without, id];
  const overflow = Math.max(0, appended.length - cap);
  return { next: appended.slice(overflow), evict: appended.slice(0, overflow) };
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `pnpm test -- src/services/registered-tables.test.ts`
Expected: PASS, 4 tests.

- [ ] **Step 5: Commit**

```bash
git add src/services/registered-tables.ts src/services/registered-tables.test.ts
git commit -m "feat: pure LRU helper for registered queryId tables"
```

---

## Task 2: Register the computed result as a DuckDB table

**Files:**
- Modify: `src/services/duckdb-wasm.ts` (add `registerResultTable`, call it at the two store sites near lines 472 and 579)

This task touches the browser-only DuckDB-WASM engine, which cannot initialize in the node vitest environment (it builds a Worker from a Blob URL). There is no end-to-end vitest here. Correctness is proven by typecheck plus the CLI script in Task 7 and the manual browser run in Task 8. The pure decision logic it depends on is already tested in Task 1.

- [ ] **Step 1: Add the registration helper**

Add near the other exported helpers in `src/services/duckdb-wasm.ts`, and add the import at the top alongside the existing `import { storeQueryResult } from "./query-store";` line.

```ts
import { touchLru } from "./registered-tables";

/** Cap on how many queryId tables we keep materialized in WASM memory. Matches the store's specific-id cap. */
const REGISTERED_TABLE_CAP = 40;
let registeredOrder: string[] = [];

/**
 * Register a computed Arrow result back into DuckDB-WASM as a persistent table
 * named after its queryId, so a follow-up `SELECT * FROM qr_5` reads cached rows
 * with zero recompute. Best-effort: any failure leaves the queryId simply not
 * reusable that turn and never breaks the user-facing result.
 */
export async function registerResultTable(id: string, arrowIPC?: Uint8Array): Promise<void> {
  if (!id || !arrowIPC) return;
  try {
    const instance = await initDuckDB();
    const conn = await instance.connect();
    try {
      const { next, evict } = touchLru(registeredOrder, id, REGISTERED_TABLE_CAP);
      registeredOrder = next;
      for (const old of evict) {
        await conn.query(`DROP TABLE IF EXISTS "${old}"`);
      }
      await conn.query(`DROP TABLE IF EXISTS "${id}"`);
      await conn.insertArrowFromIPCStream(arrowIPC, { name: id, create: true });
    } finally {
      await conn.close();
    }
  } catch {
    /* registration is best-effort, never surface to the user */
  }
}
```

- [ ] **Step 2: Call it from the main store path**

In `runQuery`, immediately after the `const queryId = storeQueryResult({ ... });` block (around line 482), before the `geometryNote` is built, add:

```ts
    // Make this result reusable as a DuckDB table named after its queryId.
    await registerResultTable(queryId, arrowIPC);
```

- [ ] **Step 3: Call it from the GEOMETRY Arrow fallback store path**

In the `catch` retry branch, after the fallback `const queryId = storeQueryResult({ ... });` (around line 579), add the same call. The fallback path also computes an `arrowIPC`; if it does not, register with `undefined` is a safe no-op.

```ts
            await registerResultTable(queryId, arrowIPC);
```

If the fallback branch has no `arrowIPC` in scope, pass the variable it serializes there; if it serializes none, call `await registerResultTable(queryId, undefined);` which early-returns.

- [ ] **Step 4: Typecheck and lint**

Run: `pnpm lint && pnpm exec tsc --noEmit`
Expected: no new errors.

- [ ] **Step 5: Commit**

```bash
git add src/services/duckdb-wasm.ts
git commit -m "feat: register computed result as reusable DuckDB table per queryId"
```

---

## Task 3: Register replayed results under the original queryId

**Files:**
- Modify: `src/lib/thread-hooks.ts` (the `useReplayQueries` re-run block near line 298)

- [ ] **Step 1: Add the import**

At the top of `src/lib/thread-hooks.ts`, extend the duckdb-wasm import:

```ts
import { runQuery, registerResultTable } from "@/services/duckdb-wasm";
```

- [ ] **Step 2: Register under the original id after re-store**

In the replay `.then(...)` block, after `if (stored) storeQueryResultWithId(originalQueryId, stored);`, register the stored Arrow under the original id so a restored thread is reusable under the id components actually reference:

```ts
              if (stored) {
                storeQueryResultWithId(originalQueryId, stored);
                void registerResultTable(originalQueryId, stored.arrowIPC);
              }
```

- [ ] **Step 3: Typecheck and lint**

Run: `pnpm lint && pnpm exec tsc --noEmit`
Expected: no new errors. Confirm `StoredQuery` exposes `arrowIPC` (it does, per `src/services/query-store.ts`).

- [ ] **Step 4: Commit**

```bash
git add src/lib/thread-hooks.ts
git commit -m "feat: re-register replayed results under their original queryId"
```

---

## Task 4: Update the geometryNote to point follow-ups at the queryId table

**Files:**
- Modify: `src/services/duckdb-wasm.ts` (the `geometryNote` template near lines 487-494)

- [ ] **Step 1: Replace the note text**

Replace the existing `geometryNote` assignment with this version. It keeps the warning for raw-file queries and adds the reusable-table path.

```ts
    const geometryNote = geomColumn
      ? `"lat" and "lng" were AUTO-GENERATED from geometry column "${geomColumn}" (${isNativeGeometry ? "GEOMETRY" : "WKB BLOB"}). ` +
        `They do NOT exist in the raw Parquet file, so do not SELECT lat/lng when querying the file directly. ` +
        `To refine this result, query the returned queryId AS A TABLE, for example SELECT * FROM ${"${queryId}"} or ` +
        `SELECT nearest_type, count(*) FROM ${"${queryId}"} GROUP BY ALL. That table already has real lat, lng and ` +
        `__geo_wkb columns, so re-sorting, re-aggregating and summarizing need no recompute. ` +
        `To re-render geometry from it, use ST_GeomFromWKB(__geo_wkb) AS geom. ` +
        `When you instead go back to the raw file, use SELECT * so geometry re-detects and lat/lng regenerate.`
      : undefined;
```

Note for the implementer: `geometryNote` is built before `queryId` exists in the current order. Move the `geometryNote` assignment to AFTER `const queryId = storeQueryResult(...)` so the template can interpolate `queryId`. Use a normal template literal with `${queryId}` (the `${"${queryId}"}` shown above is only to display the literal in this plan).

- [ ] **Step 2: Confirm ordering**

Verify the final order in `runQuery` is: serialize `arrowIPC`, `storeQueryResult` to get `queryId`, `await registerResultTable(queryId, arrowIPC)`, then build `geometryNote` referencing `queryId`, then `return`.

- [ ] **Step 3: Typecheck and lint**

Run: `pnpm lint && pnpm exec tsc --noEmit`
Expected: no new errors.

- [ ] **Step 4: Commit**

```bash
git add src/services/duckdb-wasm.ts
git commit -m "feat: geometryNote steers follow-ups to the reusable queryId table"
```

---

## Task 5: Add the three lessons to the runtime AI context

**Files:**
- Modify: `src/lib/tambo/context/duckdb-notes.ts`
- Create: `src/lib/tambo/context/sql-guidance.test.ts`

- [ ] **Step 1: Write the failing test**

```ts
// src/lib/tambo/context/sql-guidance.test.ts
import { describe, expect, it } from "vitest";
import { buildDuckdbWasmNotes } from "./duckdb-notes";

describe("buildDuckdbWasmNotes SQL lessons", () => {
  const text = buildDuckdbWasmNotes(10000).join("\n");

  it("tells the AI a prior queryId is queryable as a table", () => {
    expect(text).toContain("FROM qr_");
    expect(text.toLowerCase()).toContain("queryid");
  });

  it("teaches representative-point distance for polygon datasets", () => {
    expect(text).toContain("ST_PointOnSurface");
  });

  it("teaches compute-once derive-many", () => {
    expect(text.toLowerCase()).toContain("compute");
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm test -- src/lib/tambo/context/sql-guidance.test.ts`
Expected: FAIL, the notes do not yet contain `ST_PointOnSurface` or `FROM qr_`.

- [ ] **Step 3: Add the three lessons**

In `src/lib/tambo/context/duckdb-notes.ts`, append three entries to the array returned by `buildDuckdbWasmNotes`, before the closing `]`:

```ts
    "Reuse results, do not recompute. Every runSQL returns a queryId such as qr_5, and that queryId is also a real table you can read. To re-sort, re-aggregate, bin or summarize a result you already computed, write FROM qr_5 instead of pasting the expensive query again. The table holds the result columns, including the auto-generated lat and lng, and __geo_wkb when geometry was detected (re-render with ST_GeomFromWKB(__geo_wkb) AS geom).",
    "Compute once, derive many. For a question that needs several views, build the heavy metric query one time, take its queryId, then derive every ranking, chart and summary from that queryId. Do not rebuild the metric for each panel.",
    "Distance from an area. To measure distance from a polygon dataset such as municipalities or parcels to features such as lakes or roads, measure from a representative point with ST_PointOnSurface(geom), for example ST_Distance(ST_PointOnSurface(k.geom), w.geom). Polygon-to-polygon distance is 0 wherever the shapes overlap, which silently turns every row into 0. Keep the bbox prefilter on the flat xmin, ymin, xmax, ymax columns so DuckDB still prunes row groups.",
```

- [ ] **Step 4: Run the new test and the full suite**

Run: `pnpm test -- src/lib/tambo/context/sql-guidance.test.ts`
Expected: PASS, 3 tests.

Run: `pnpm test`
Expected: PASS. Confirm `context-cleanliness.test.ts` still passes (the new entries add `queryId`-friendly text and break none of its assertions).

- [ ] **Step 5: Commit**

```bash
git add src/lib/tambo/context/duckdb-notes.ts src/lib/tambo/context/sql-guidance.test.ts
git commit -m "feat: AI context teaches queryId reuse, compute-once, area distance"
```

---

## Task 6: Update the runSQL tool description

**Files:**
- Modify: `src/lib/tambo/tools/run-sql.ts`

- [ ] **Step 1: Tighten the description and the sql field hint**

Replace the `description` and the `sql` field `.describe(...)` so routing reflects the new reuse rule:

```ts
  description:
    "Execute DuckDB SQL (v1.5 WASM) against remote Parquet files, GeoJSON, or WFS endpoints. " +
    "Returns a queryId for GeoMap/Graph/DataTable components (zero token cost). " +
    "A prior queryId is also a real table: write FROM qr_5 to re-sort, re-aggregate or summarize a result instead of recomputing it. " +
    "See DuckDB notes for queryId reuse, distance-from-area, syntax, and query patterns.",
```

```ts
        "DuckDB SQL. HTTPS URLs in FROM. Reuse a prior result with FROM <queryId> (e.g. FROM qr_5). " +
          "Use LIMIT from queryLimit in context. ONE statement. " +
          "Geometry: SELECT * (auto-detected, lat/lng auto-generated). " +
          "Distance from a polygon dataset: measure from ST_PointOnSurface(geom), not the polygon. " +
          "See DuckDB notes for full rules.",
```

- [ ] **Step 2: Typecheck and lint**

Run: `pnpm lint && pnpm exec tsc --noEmit`
Expected: no new errors.

- [ ] **Step 3: Commit**

```bash
git add src/lib/tambo/tools/run-sql.ts
git commit -m "feat: runSQL description teaches queryId reuse and area distance"
```

---

## Task 7: Flip the CLAUDE.md rule and add the distance lesson

**Files:**
- Modify: `CLAUDE.md` (the "DuckDB Rules" section)

- [ ] **Step 1: Replace the queryId bullet**

Find the bullet that begins `- **queryId is NOT a DuckDB table**:` and replace the whole bullet with:

```markdown
- **queryId IS a reusable table**: every `runSQL` returns a queryId (e.g. `qr_5`) that is registered back into DuckDB-WASM as a real table of the same name. To re-sort, re-aggregate, bin or summarize a result you already computed, write `FROM qr_5` instead of pasting the expensive query again. The table holds the result columns including auto-generated `lat`/`lng` and `__geo_wkb` (re-render geometry with `ST_GeomFromWKB(__geo_wkb)`). It is NOT a Parquet path, so use it only in `FROM`, never inside `read_parquet(...)`. Tables are kept on an LRU (last 40), older ones are dropped.
```

- [ ] **Step 2: Add the distance lesson**

Add a new bullet near the spatial-analysis bullets:

```markdown
- **Distance from an area**: to measure how close a polygon dataset (municipalities, parcels) sits to features (lakes, roads, sea), measure from a representative point with `ST_PointOnSurface(geom)`, e.g. `ST_Distance(ST_PointOnSurface(k.geom), w.geom)`. Polygon-to-polygon distance is `0` wherever shapes overlap, which silently makes every row `0`. Keep the bbox prefilter on `xmin, ymin, xmax, ymax` for row-group pruning.
```

- [ ] **Step 3: Commit**

```bash
git add CLAUDE.md
git commit -m "docs: flip queryId rule and document area distance in CLAUDE.md"
```

---

## Task 8: DuckDB CLI validation script

**Files:**
- Create: `scripts/validate-sql-guidance.sql`

- [ ] **Step 1: Write the validation script**

```sql
-- scripts/validate-sql-guidance.sql
-- Validate the SQL lessons against the DuckDB v1.5 engine (CLI mirrors the WASM build).
-- Run: duckdb < scripts/validate-sql-guidance.sql
INSTALL spatial; LOAD spatial;

-- Lesson: polygon-to-polygon distance is 0 on overlap; a representative point is honest.
-- muni is the 0..10 square (representative point ~ 5,5); water overlaps only the top-right corner.
WITH a AS (SELECT ST_GeomFromText('POLYGON((0 0, 0 10, 10 10, 10 0, 0 0))') AS muni),
     b AS (SELECT ST_GeomFromText('POLYGON((9 9, 9 12, 12 12, 12 9, 9 9))') AS water)
SELECT
  ST_Distance(a.muni, b.water)                              AS polygon_to_polygon,   -- expect 0.0
  round(ST_Distance(ST_PointOnSurface(a.muni), b.water), 3) AS point_on_surface      -- expect ~5.657
FROM a, b;

-- Lesson: materialize once, re-aggregate cheaply by name (mirrors registering qr_N).
CREATE TABLE qr_demo AS
  SELECT * FROM (VALUES ('lake', 0.2), ('river', 0.8), ('lake', 0.5), ('sea', 0.6)) AS t(nearest_type, km);
SELECT nearest_type, count(*) AS municipalities, round(avg(km), 2) AS avg_km
FROM qr_demo GROUP BY ALL ORDER BY municipalities DESC;
```

- [ ] **Step 2: Run it and confirm output**

Run: `duckdb < scripts/validate-sql-guidance.sql`
Expected: first result `polygon_to_polygon = 0.0` and `point_on_surface = 5.657`; second result groups `lake=2 (0.35)`, `river=1 (0.8)`, `sea=1 (0.6)`.

- [ ] **Step 3: Commit**

```bash
git add scripts/validate-sql-guidance.sql
git commit -m "test: duckdb cli script validating distance and table-reuse lessons"
```

---

## Task 9: Manual browser verification

**Files:** none (verification only)

The WASM round trip cannot run in vitest, so verify it in the running app.

- [ ] **Step 1: Start the app**

Run: `pnpm dev`
Open `localhost:5173/portolan-ai/finland`.

- [ ] **Step 2: Reuse round trip**

In chat, ask a question that produces a result (e.g. a small `SELECT` over `kunta_2025`). Note the returned queryId (e.g. `qr_1`). Then ask a follow-up that should reuse it. Confirm in the network/console that the follow-up SQL is `... FROM qr_1 ...` and returns without "Table qr_1 does not exist".

- [ ] **Step 3: Geometry re-render from a queryId**

After a geometry query `qr_N`, run `SELECT *, ST_GeomFromWKB(__geo_wkb) AS geom FROM qr_N LIMIT 100` and confirm the map renders.

- [ ] **Step 4: Distance lesson**

Re-run the Finland "areas closest to lakes, rivers and the sea" question. Confirm the AI uses `ST_PointOnSurface` for distance and does not produce an all-zero result, and that it derives the ranking and summary with `FROM qr_N` rather than rerunning the heavy CTE.

- [ ] **Step 5: IPC fallback check**

If Step 2 shows an Arrow IPC format error from `insertArrowFromIPCStream`, switch the registration source: at the `runQuery` call site, re-serialize the live Arrow `result` as a stream and pass that, or reconstruct via apache-arrow `tableFromIPC(arrowIPC)` + `conn.insertArrowTable(table, { name: id, create: true })`. Re-run Step 2 to confirm.

---

## Self-review notes

- Spec Part 1 (register Arrow result, LRU, both call sites, replay) maps to Tasks 1, 2, 3. Spec Part 2 (flip rule, distance, compute-once, geometryNote, CLAUDE.md) maps to Tasks 4, 5, 6, 7. Spec testing (CLI, manual) maps to Tasks 8, 9.
- Type consistency: `touchLru` returns `{ next, evict }` and is consumed with that exact shape in Task 2. `registerResultTable(id, arrowIPC?)` signature is identical at all three call sites (Tasks 2 and 3). `StoredQuery.arrowIPC` is the field read in Task 3.
- Known risk carried into Task 9 Step 5: `insertArrowFromIPCStream` expecting a stream-format IPC. The fallback path is specified, not left as a placeholder.
