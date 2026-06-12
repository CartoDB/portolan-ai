# GeoMap Style Expressions Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Give the AI per-feature conditional styling on GeoMap (fill color, elevation, radius) via restricted JS expressions over query result columns, adapted from the deck.gl JSON `@@=` accessor pattern, while keeping the GeoArrow zero-copy rendering pipeline fully intact.

**Architecture:** A new pure module `src/services/geo/style-expressions.ts` compiles expression strings with `_parseExpressionString` from `@deck.gl/json` (jsep-based AST evaluation, function calls blocked, no eval). Three new optional schema fields (`fillColorExpression`, `elevationExpression`, `radiusExpression`) flow from the Tambo props through `LayerConfig` into `buildLayers`, where adapter factories produce deck.gl accessors for both accessor shapes: GeoArrow layers (`({index}) => ...` reading only the referenced Arrow columns per feature) and JS-object layers (`(d) => ...`). Legend min/max for numeric expressions is computed once over the already-materialized JS rows in `transformQueryToLayer`.

**Tech Stack:** Vite + React 19, Tambo SDK 1.2.8 (Zod 4 propsSchemas), deck.gl 9.3.3, `@geoarrow/deck.gl-geoarrow` 0.4.1, apache-arrow 21, vitest, Biome.

---

## Spec

### Why this and not the full JSONConverter

The CARTO `carto-agentic-deckgl` pattern ("AI emits deck.gl JSON specs, JSONConverter instantiates layers") conflicts with two hard constraints of this codebase:

1. **GeoArrow zero-copy with DuckDB-WASM is mandatory** (product decision, 2026-06-12). `JSONConverter` instantiates standard deck.gl layers over JS row objects, bypassing the WKB → `buildGeoArrowTables()` → GPU pipeline.
2. Tambo propsSchemas forbid `z.record()`, so an open-ended layer spec cannot be modeled as structured props anyway.

The one piece of deck.gl JSON that transfers cleanly is the **`@@=` accessor expression** semantics: a restricted, safely-evaluated JS expression over the per-feature data. We adopt the parser (`_parseExpressionString` from `@deck.gl/json`) and the semantics, NOT the `@@=` string prefix (the schema field already declares it is an expression) and NOT the JSONConverter runtime.

### Expression language (what the AI can write)

- Identifiers = **exact, case-sensitive column names of the query result** (e.g. `USP_TX_DEN`, `value`, `n_floors`). Synthetic `lat`/`lng` exist in result rows so they are legal identifiers too.
- Allowed: arithmetic (`+ - * / %`), comparisons (`> >= < <= == !=`), boolean logic (`&& || !`), ternary (`a ? b : c`), array literals (`[215,48,39,200]`), numeric/string literals, parentheses.
- Forbidden: function calls (the parser throws `"Function calls not allowed in JSON expressions"` at evaluation), assignment, `new`, anything else jsep cannot parse.
- Column names that are not valid JS identifiers (spaces, dashes, leading digits) cannot be referenced; the AI must alias them in SQL first (`SELECT "weird col" AS weird_col`).

### Field semantics

| Field | Returns | Behavior |
|-------|---------|----------|
| `fillColorExpression` | number | Ramped through the layer's `colorScheme` with percentile min/max computed over the expression's values across all rows (legend matches). |
| `fillColorExpression` | `[r,g,b]` or `[r,g,b,a]` (0-255) | Used directly (alpha defaults to 200, channels clamped/rounded). Gradient legend is hidden (no scalar to ramp); feature count still shows. |
| `elevationExpression` | number | Per-feature extrusion height, used as-is with the existing `elevationScale`. Only meaningful with `extruded=true`. |
| `radiusExpression` | number | Point radius in meters (scatterplot / WKB point layers). |

- Expressions **override** the corresponding `valueColumn`-driven default accessor. Other accessors keep their existing behavior.
- Error policy: a compile failure disables the expression (one `console.warn`, fall back to existing valueColumn styling). A per-feature evaluation error or non-conforming return value falls back to the layer's existing fallback color / 0 elevation / default radius. The map never blanks because of a bad expression.

### Layer coverage (v1)

| Layer path | fillColor | elevation | radius |
|------------|-----------|-----------|--------|
| WKB → GeoArrowPolygonLayer | yes | yes | - |
| WKB → GeoArrowPathLayer (`getColor`) | yes | - | - |
| WKB → GeoArrowScatterplotLayer (points) | yes | - | yes |
| scatterplot → GeoArrowScatterplotLayer | yes | - | yes |
| scatterplot → ScatterplotLayer (fallback) | yes | - | yes |
| h3 → H3HexagonLayer | yes | yes | - |
| a5 → A5Layer | yes | yes | - |
| geojson → GeoJsonLayer (fallback) | yes | yes | - |
| arc → (both paths) | **not supported in v1** (source/target color pair is a different shape; defer) |

Known limitation: on the `scatterplot` GeoArrow path the position columns (`latColumn`/`lngColumn`) are not copied into the Arrow table, so expressions cannot reference them on that one path. All other columns work everywhere.

### Zero-copy preservation

GeoArrow accessors are evaluated once per feature at GPU attribute-fill time (and on `updateTriggers` change), exactly like the existing `data.data.getChild("value")?.get(index)` accessors. The expression adapter reads **only the columns named in the expression** via `table.getChild(name).get(index)`. No Arrow data is converted to JS row arrays; geometry buffers are untouched. `updateTriggers` gain the expression strings so styling changes from `update_component_props` re-fill attributes without layer re-creation.

### Non-goals (explicitly out of scope, candidates for future plans)

- A `JSONConverter`-based escape-hatch layer type (`@@type` specs). Violates the GeoArrow mandate for catalog data; revisit only if registering GeoArrow classes in a JSON class catalog proves valuable.
- Mask/spatial-filter layer (CARTO repo's `set-mask-layer` + MaskExtension + EditableGeoJsonLayer). Independent subsystem; needs its own brainstorm + plan.
- Arc layer expressions, line color expressions, text/icon layers.
- `@@function` / `@@#` constant catalogs.

---

## File Structure

| File | Action | Responsibility |
|------|--------|----------------|
| `package.json` | Modify | Add `@deck.gl/json@^9.3.3` |
| `src/services/geo/style-expressions.ts` | Create | Compile/evaluate expressions, identifier extraction, color/number normalization, Arrow row reader, legend stats. Pure, no React, no deck.gl layer imports. |
| `src/services/geo/style-expressions.test.ts` | Create | Unit tests for everything above (vitest, real apache-arrow tables) |
| `src/components/tambo/geo-map-deckgl.tsx` | Modify | `LayerConfig` fields + expression-aware accessors in `buildLayers` + updateTriggers |
| `src/components/tambo/geo-map.tsx` | Modify | Zod schema fields, plumb through `transformQueryToLayer`, legend stats, useMemo deps, scatter fallback full-row data |
| `src/lib/tambo/context/component-tips.ts` | Modify | Teach the AI the expression syntax + when to use it |
| `CLAUDE.md`, `.claude/rules/components.md` | Modify | Document the new capability |

---

### Task 1: Dependency + failing tests for the expression module

**Files:**
- Modify: `package.json` (via pnpm)
- Create: `src/services/geo/style-expressions.test.ts`

- [ ] **Step 1: Add the dependency**

```bash
pnpm add @deck.gl/json@^9.3.3
```

Expected: installs cleanly, version aligned with existing `@deck.gl/core@^9.3.3`.

- [ ] **Step 2: Write the failing test file**

Create `src/services/geo/style-expressions.test.ts`:

```ts
import { Table, vectorFromArray } from "apache-arrow";
import { describe, expect, it } from "vitest";
import {
  compileExpression,
  evaluateExpressionStats,
  extractIdentifiers,
  makeArrowRowReader,
  normalizeExpressionColor,
  normalizeExpressionNumber,
  safeEvalExpression,
} from "./style-expressions";

describe("extractIdentifiers", () => {
  it("extracts column identifiers from arithmetic", () => {
    expect(extractIdentifiers("pop / area")).toEqual(["pop", "area"]);
  });

  it("dedupes and keeps order", () => {
    expect(extractIdentifiers("v > 10 ? v * 2 : other")).toEqual(["v", "other"]);
  });

  it("ignores string literals and reserved words", () => {
    expect(extractIdentifiers("kind == 'true' ? 1 : null")).toEqual(["kind"]);
  });

  it("ignores property access after a dot", () => {
    expect(extractIdentifiers("obj.prop + obj2")).toEqual(["obj", "obj2"]);
  });

  it("handles case-sensitive DuckDB column names", () => {
    expect(extractIdentifiers("USP_TX_DEN > 50")).toEqual(["USP_TX_DEN"]);
  });
});

describe("compileExpression / safeEvalExpression", () => {
  it("evaluates a ternary returning a color array", () => {
    const c = compileExpression("v > 10 ? [255, 0, 0] : [0, 255, 0]");
    expect(c).not.toBeNull();
    expect(safeEvalExpression(c!, { v: 20 })).toEqual([255, 0, 0]);
    expect(safeEvalExpression(c!, { v: 5 })).toEqual([0, 255, 0]);
  });

  it("evaluates a bare identifier", () => {
    const c = compileExpression("USP_TX_DEN");
    expect(safeEvalExpression(c!, { USP_TX_DEN: 42 })).toBe(42);
  });

  it("evaluates arithmetic and boolean logic", () => {
    const c = compileExpression("(a + b) * 2 >= 10 && flag");
    expect(safeEvalExpression(c!, { a: 3, b: 2, flag: true })).toBe(true);
  });

  it("returns undefined (not throws) when evaluation fails", () => {
    const c = compileExpression("alert(1)");
    // jsep may parse the call; deck.gl blocks it at evaluation - either compile
    // returns null or evaluation safely yields undefined. Both are acceptable.
    if (c) {
      expect(safeEvalExpression(c, {})).toBeUndefined();
    } else {
      expect(c).toBeNull();
    }
  });

  it("returns null for unparseable input", () => {
    expect(compileExpression("][")).toBeNull();
  });

  it("caches compiled expressions by source", () => {
    expect(compileExpression("v + 1")).toBe(compileExpression("v + 1"));
  });
});

describe("normalizeExpressionColor", () => {
  const ramp = (v: number): [number, number, number, number] => [v, v, v, 255];
  const fallback: [number, number, number, number] = [1, 2, 3, 4];

  it("ramps numbers through the color scheme", () => {
    expect(normalizeExpressionColor(7, ramp, fallback)).toEqual([7, 7, 7, 255]);
  });

  it("coerces bigint to number before ramping", () => {
    expect(normalizeExpressionColor(7n, ramp, fallback)).toEqual([7, 7, 7, 255]);
  });

  it("passes [r,g,b] through with default alpha 200", () => {
    expect(normalizeExpressionColor([10, 20, 30], ramp, fallback)).toEqual([10, 20, 30, 200]);
  });

  it("passes [r,g,b,a] through, clamping and rounding channels", () => {
    expect(normalizeExpressionColor([300, -5, 19.6, 100], ramp, fallback)).toEqual([255, 0, 20, 100]);
  });

  it("falls back on null, NaN, strings and bad arrays", () => {
    expect(normalizeExpressionColor(null, ramp, fallback)).toEqual(fallback);
    expect(normalizeExpressionColor(Number.NaN, ramp, fallback)).toEqual(fallback);
    expect(normalizeExpressionColor("red", ramp, fallback)).toEqual(fallback);
    expect(normalizeExpressionColor([1, 2], ramp, fallback)).toEqual(fallback);
  });
});

describe("normalizeExpressionNumber", () => {
  it("passes finite numbers, coerces bigint, rejects the rest", () => {
    expect(normalizeExpressionNumber(5)).toBe(5);
    expect(normalizeExpressionNumber(5n)).toBe(5);
    expect(normalizeExpressionNumber(Number.NaN)).toBeNull();
    expect(normalizeExpressionNumber("5")).toBeNull();
    expect(normalizeExpressionNumber(null)).toBeNull();
  });
});

describe("evaluateExpressionStats", () => {
  const rows = [{ v: 1 }, { v: 10 }, { v: 100 }, { v: null }];

  it("classifies numeric expressions and collects values", () => {
    const s = evaluateExpressionStats(rows, "v * 2");
    expect(s.kind).toBe("number");
    expect(s.values).toEqual([2, 20, 200]);
  });

  it("classifies color expressions with no values", () => {
    const s = evaluateExpressionStats(rows, "v > 5 ? [255,0,0] : [0,0,255]");
    expect(s.kind).toBe("color");
    expect(s.values).toEqual([]);
  });

  it("classifies invalid expressions", () => {
    expect(evaluateExpressionStats(rows, "][").kind).toBe("invalid");
  });
});

describe("makeArrowRowReader", () => {
  it("reads only referenced columns from an Arrow table and coerces bigint", () => {
    const table = new Table({
      v: vectorFromArray([10n, 20n]),
      name: vectorFromArray(["a", "b"]),
      unused: vectorFromArray([0, 0]),
    });
    const read = makeArrowRowReader(table, ["v", "name", "missing_col"]);
    expect(read(0)).toEqual({ v: 10, name: "a" });
    expect(read(1)).toEqual({ v: 20, name: "b" });
  });

  it("composes with compiled expressions", () => {
    const table = new Table({ v: vectorFromArray([5, 50]) });
    const c = compileExpression("v > 10 ? [255,0,0] : [0,0,255]");
    const read = makeArrowRowReader(table, c!.identifiers);
    expect(safeEvalExpression(c!, read(0))).toEqual([0, 0, 255]);
    expect(safeEvalExpression(c!, read(1))).toEqual([255, 0, 0]);
  });
});
```

- [ ] **Step 3: Run the tests to verify they fail**

```bash
pnpm vitest run src/services/geo/style-expressions.test.ts
```

Expected: FAIL with "Cannot find module './style-expressions'" (or equivalent resolve error).

- [ ] **Step 4: Commit**

```bash
git add package.json pnpm-lock.yaml src/services/geo/style-expressions.test.ts
git commit -m "test(map): failing tests for style expression module"
```

---

### Task 2: Implement the expression module

**Files:**
- Create: `src/services/geo/style-expressions.ts`

- [ ] **Step 1: Write the implementation**

Create `src/services/geo/style-expressions.ts`:

```ts
/**
 * Restricted per-feature style expressions for GeoMap, adapted from the
 * deck.gl JSON "@@=" accessor semantics (without the prefix).
 *
 * Expressions are parsed by @deck.gl/json's jsep-based evaluator: a safe AST
 * walk over arithmetic / comparison / ternary / boolean / array-literal nodes.
 * Function calls are rejected at evaluation time, there is no eval() and no
 * Function() constructor involved.
 *
 * Identifiers resolve to query-result column names (case-sensitive). For
 * GeoArrow layers, makeArrowRowReader materializes ONLY the referenced
 * columns per feature, so the zero-copy geometry pipeline is untouched.
 */
import { _parseExpressionString as parseExpressionString } from "@deck.gl/json";

export type RGBA = [number, number, number, number];

export interface CompiledExpression {
  source: string;
  /** Candidate column names referenced by the expression */
  identifiers: string[];
  fn: (row: Record<string, unknown>) => unknown;
}

const RESERVED = new Set(["true", "false", "null", "undefined"]);

/**
 * Best-effort identifier extraction. Over-extraction is harmless: the Arrow
 * row reader intersects with the table's actual columns, and JS-object rows
 * simply yield undefined for non-columns.
 */
export function extractIdentifiers(expr: string): string[] {
  const noStrings = expr.replace(/'[^']*'|"[^"]*"/g, "");
  const noProps = noStrings.replace(/\.\s*[A-Za-z_$][A-Za-z0-9_$]*/g, "");
  const matches = noProps.match(/[A-Za-z_$][A-Za-z0-9_$]*/g) ?? [];
  const out: string[] = [];
  for (const m of matches) {
    if (!RESERVED.has(m) && !out.includes(m)) out.push(m);
  }
  return out;
}

const compileCache = new Map<string, CompiledExpression | null>();

/** Compile an expression string. Returns null (and warns once) on parse failure. */
export function compileExpression(expr: string): CompiledExpression | null {
  const cached = compileCache.get(expr);
  if (cached !== undefined) return cached;
  let compiled: CompiledExpression | null = null;
  try {
    const fn = parseExpressionString(expr) as (row: Record<string, unknown>) => unknown;
    compiled = { source: expr, identifiers: extractIdentifiers(expr), fn };
  } catch (e) {
    console.warn(`[style-expressions] failed to compile "${expr}":`, e);
    compiled = null;
  }
  compileCache.set(expr, compiled);
  return compiled;
}

/** Evaluate against a row; never throws (bad features fall back to defaults). */
export function safeEvalExpression(compiled: CompiledExpression, row: Record<string, unknown>): unknown {
  try {
    return compiled.fn(row);
  } catch {
    return undefined;
  }
}

function clampChannel(c: number): number {
  return Math.max(0, Math.min(255, Math.round(c)));
}

/**
 * Normalize an expression result into an RGBA color.
 * number → ramped through the layer's color scheme.
 * [r,g,b] / [r,g,b,a] (0-255) → used directly (default alpha 200).
 * anything else → fallback.
 */
export function normalizeExpressionColor(result: unknown, ramp: (v: number) => RGBA, fallback: RGBA): RGBA {
  if (typeof result === "bigint") return ramp(Number(result));
  if (typeof result === "number") {
    return Number.isFinite(result) ? ramp(result) : fallback;
  }
  if (
    Array.isArray(result) &&
    (result.length === 3 || result.length === 4) &&
    result.every((c) => typeof c === "number" && Number.isFinite(c))
  ) {
    return [
      clampChannel(result[0]),
      clampChannel(result[1]),
      clampChannel(result[2]),
      result.length === 4 ? clampChannel(result[3]) : 200,
    ];
  }
  return fallback;
}

/** Normalize an expression result into a finite number, or null. */
export function normalizeExpressionNumber(result: unknown): number | null {
  if (typeof result === "bigint") return Number(result);
  if (typeof result === "number" && Number.isFinite(result)) return result;
  return null;
}

export type ExpressionKind = "number" | "color" | "invalid";

/**
 * Evaluate a fill color expression over materialized JS rows to derive the
 * legend/ramp domain. "number" → values feed computePercentileRange.
 * "color" → explicit colors, no scalar domain (gradient legend hidden).
 */
export function evaluateExpressionStats(
  rows: Record<string, unknown>[],
  expr: string,
): { kind: ExpressionKind; values: number[] } {
  const compiled = compileExpression(expr);
  if (!compiled) return { kind: "invalid", values: [] };
  const values: number[] = [];
  let kind: ExpressionKind = "invalid";
  for (const row of rows) {
    const r = safeEvalExpression(compiled, row);
    if (r == null) continue;
    if (typeof r === "number" || typeof r === "bigint") {
      const n = Number(r);
      if (Number.isFinite(n)) {
        kind = "number";
        values.push(n);
      }
    } else if (Array.isArray(r)) {
      return { kind: "color", values: [] };
    }
  }
  return { kind, values };
}

interface ArrowColumnLike {
  get: (index: number) => unknown;
}

interface ArrowTableLike {
  getChild: (name: string) => ArrowColumnLike | null;
}

/**
 * Per-feature row reader for GeoArrow accessors. Resolves the referenced
 * identifiers against the Arrow table ONCE, then reads just those columns
 * per feature (same O(1) getChild().get(index) pattern the existing value
 * accessors use - zero-copy buffers stay untouched).
 */
export function makeArrowRowReader(
  table: ArrowTableLike,
  identifiers: string[],
): (index: number) => Record<string, unknown> {
  const cols: [string, ArrowColumnLike][] = [];
  for (const name of identifiers) {
    const child = table.getChild(name);
    if (child) cols.push([name, child]);
  }
  return (index: number) => {
    const row: Record<string, unknown> = {};
    for (const [name, col] of cols) {
      const v = col.get(index);
      row[name] = typeof v === "bigint" ? Number(v) : v;
    }
    return row;
  };
}
```

- [ ] **Step 2: Run the tests to verify they pass**

```bash
pnpm vitest run src/services/geo/style-expressions.test.ts
```

Expected: PASS (all suites).

**Contingency:** if `_parseExpressionString` is not exported by `@deck.gl/json@9.3.3` or its signature mismatches (it is an experimental underscore export), do NOT hack around it inline. Replace the import with a direct dependency on `jsep` + a ~40-line AST evaluator in this same module (the test file already pins the required behavior and stays unchanged). Flag this in the task report.

- [ ] **Step 3: Lint**

```bash
pnpm lint:fix
```

Expected: clean (Biome may reformat; that's fine).

- [ ] **Step 4: Commit**

```bash
git add src/services/geo/style-expressions.ts src/services/geo/style-expressions.test.ts
git commit -m "feat(map): style expression module (compile, normalize, arrow row reader)"
```

---

### Task 3: Expression-aware accessors in geo-map-deckgl.tsx

**Files:**
- Modify: `src/components/tambo/geo-map-deckgl.tsx`

All edits are in this one file. The existing accessors remain the defaults; expressions take over only when present.

- [ ] **Step 1: Add imports and LayerConfig fields**

Add to the imports (after the `consumeFlyTo` import, `geo-map-deckgl.tsx:17`):

```ts
import {
  compileExpression,
  makeArrowRowReader,
  normalizeExpressionColor,
  normalizeExpressionNumber,
  type RGBA,
  safeEvalExpression,
} from "@/services/geo/style-expressions";
```

In `interface LayerConfig` (after `wkbArrays?`, `geo-map-deckgl.tsx:38`), add:

```ts
  /** Restricted JS expression over result columns → number (ramped) or [r,g,b,a] */
  fillColorExpression?: string;
  /** Restricted JS expression over result columns → extrusion height (number) */
  elevationExpression?: string;
  /** Restricted JS expression over result columns → point radius in meters (number) */
  radiusExpression?: string;
```

- [ ] **Step 2: Add accessor adapter helpers**

Insert above `function buildLayers(` (`geo-map-deckgl.tsx:398`):

```ts
/* ── Expression accessor adapters ───────────────────────────────── */

interface LayerExpressions {
  fill: ReturnType<typeof compileExpression>;
  elevation: ReturnType<typeof compileExpression>;
  radius: ReturnType<typeof compileExpression>;
}

function compileLayerExpressions(config: LayerConfig): LayerExpressions {
  return {
    fill: config.fillColorExpression ? compileExpression(config.fillColorExpression) : null,
    elevation: config.elevationExpression ? compileExpression(config.elevationExpression) : null,
    radius: config.radiusExpression ? compileExpression(config.radiusExpression) : null,
  };
}

function hasAnyExpression(ex: LayerExpressions): boolean {
  return !!(ex.fill || ex.elevation || ex.radius);
}

function allExpressionIdentifiers(ex: LayerExpressions): string[] {
  return [
    ...new Set([
      ...(ex.fill?.identifiers ?? []),
      ...(ex.elevation?.identifiers ?? []),
      ...(ex.radius?.identifiers ?? []),
    ]),
  ];
}

/** JS-object rows: GeoJSON features expose columns under .properties, others directly */
function jsRow(d: any): Record<string, unknown> {
  return d?.properties ?? d ?? {};
}
```

- [ ] **Step 3: Compile expressions once per layer in buildLayers**

Inside the `for` loop of `buildLayers`, after `const useGeoArrow = canUseGeoArrow(config);` (`geo-map-deckgl.tsx:443`), add:

```ts
    const ramp = (v: number): RGBA => valueToColor(v, lo, hi, scheme);
    const exprs = compileLayerExpressions(config);
    const exprTriggers = [config.fillColorExpression, config.elevationExpression, config.radiusExpression];
```

- [ ] **Step 4: Wire the h3 layer**

In the `H3HexagonLayer` props, replace:

```ts
              getFillColor: (d: any) =>
                d.value != null ? valueToColor(d.value, lo, hi, scheme) : [100, 150, 255, 120],
```

with:

```ts
              getFillColor: exprs.fill
                ? (d: any) => normalizeExpressionColor(safeEvalExpression(exprs.fill!, jsRow(d)), ramp, [100, 150, 255, 120])
                : (d: any) => (d.value != null ? valueToColor(d.value, lo, hi, scheme) : [100, 150, 255, 120]),
```

Replace its `getElevation`:

```ts
              getElevation: exprs.elevation
                ? (d: any) => (extruded ? (normalizeExpressionNumber(safeEvalExpression(exprs.elevation!, jsRow(d))) ?? 0) : 0)
                : (d: any) => {
                    if (!extruded || d.value == null) return 0;
                    const range = hi - lo || 1;
                    const t = (d.value - lo) / range;
                    return t * 500;
                  },
```

Replace its `updateTriggers`:

```ts
              updateTriggers: {
                getFillColor: [lo, hi, scheme, ...exprTriggers],
                getElevation: [lo, hi, extruded, ...exprTriggers],
              },
```

- [ ] **Step 5: Wire the a5 layer**

Apply the identical three replacements to the `A5Layer` block (same prop names, same fallback colors).

- [ ] **Step 6: Wire the scatterplot layers (GeoArrow + fallback)**

GeoArrow branch (`GeoArrowScatterplotLayer`, built from `table`): before `result.push(`, add:

```ts
            const readRow = hasAnyExpression(exprs) ? makeArrowRowReader(table, allExpressionIdentifiers(exprs)) : null;
```

Replace `getRadius`:

```ts
                getRadius: exprs.radius && readRow
                  ? ({ index }: any) => normalizeExpressionNumber(safeEvalExpression(exprs.radius!, readRow(index))) ?? 8000
                  : ({ index, data }: any) => {
                      const v = data.data.getChild("value")?.get(index);
                      if (v == null) return 8000;
                      const range = hi - lo || 1;
                      return 3000 + ((Number(v) - lo) / range) * 30000;
                    },
```

Replace `getFillColor`:

```ts
                getFillColor: exprs.fill && readRow
                  ? ({ index }: any) =>
                      normalizeExpressionColor(safeEvalExpression(exprs.fill!, readRow(index)), ramp, [100, 150, 255, 150])
                  : ({ index, data }: any) => {
                      const v = data.data.getChild("value")?.get(index);
                      return v != null ? valueToColor(Number(v), lo, hi, scheme) : [100, 150, 255, 150];
                    },
```

Replace its `updateTriggers`:

```ts
                updateTriggers: {
                  getFillColor: [lo, hi, scheme, ...exprTriggers],
                  getRadius: [lo, hi, ...exprTriggers],
                },
```

Fallback branch (`ScatterplotLayer`): same pattern with JS rows:

```ts
                getRadius: exprs.radius
                  ? (d: any) => normalizeExpressionNumber(safeEvalExpression(exprs.radius!, jsRow(d))) ?? 8000
                  : (d: any) => {
                      if (d.radius != null) return d.radius;
                      if (d.value == null) return 8000;
                      const range = hi - lo || 1;
                      return 3000 + ((d.value - lo) / range) * 30000;
                    },
                getFillColor: exprs.fill
                  ? (d: any) => normalizeExpressionColor(safeEvalExpression(exprs.fill!, jsRow(d)), ramp, [100, 150, 255, 150])
                  : (d: any) => (d.value != null ? valueToColor(d.value, lo, hi, scheme) : [100, 150, 255, 150]),
```

and the same `updateTriggers` replacement as the GeoArrow branch.

- [ ] **Step 7: Wire the WKB layers (point / path / polygon)**

Inside the `for (const gr of geoResults)` loop, before the `if (geoLayerType === ...)` chain, add:

```ts
              const readRow = hasAnyExpression(exprs)
                ? makeArrowRowReader(gr.table, allExpressionIdentifiers(exprs))
                : null;
```

**Point (`GeoArrowScatterplotLayer`)**: replace `getFillColor` / `getRadius` / `updateTriggers` exactly as in the scatterplot GeoArrow branch (Step 6), fallback color `[100, 150, 255, 150]`.

**Path (`GeoArrowPathLayer`)**: replace `getColor`:

```ts
                    getColor: exprs.fill && readRow
                      ? ({ index }: any) =>
                          normalizeExpressionColor(safeEvalExpression(exprs.fill!, readRow(index)), ramp, [100, 150, 255, 200])
                      : ({ index, data }: any) => {
                          const v = data.data.getChild("value")?.get(index);
                          return v != null ? valueToColor(Number(v), lo, hi, scheme) : [100, 150, 255, 200];
                        },
```

and `updateTriggers: { getColor: [lo, hi, scheme, ...exprTriggers] }`.

**Polygon (`GeoArrowPolygonLayer`)**: replace `getFillColor`:

```ts
                    getFillColor: exprs.fill && readRow
                      ? ({ index }: any) =>
                          normalizeExpressionColor(safeEvalExpression(exprs.fill!, readRow(index)), ramp, [100, 150, 255, 120])
                      : ({ index, data }: any) => {
                          const v = data.data.getChild("value")?.get(index);
                          return v != null ? valueToColor(Number(v), lo, hi, scheme) : [100, 150, 255, 120];
                        },
```

replace `getElevation`:

```ts
                    getElevation: exprs.elevation && readRow
                      ? ({ index }: any) =>
                          extruded ? (normalizeExpressionNumber(safeEvalExpression(exprs.elevation!, readRow(index))) ?? 0) : 0
                      : ({ index, data }: any) => {
                          if (!extruded) return 0;
                          const v = data.data.getChild("value")?.get(index);
                          if (v == null) return 0;
                          const range = hi - lo || 1;
                          return ((Number(v) - lo) / range) * 500;
                        },
```

and `updateTriggers`:

```ts
                    updateTriggers: {
                      getFillColor: [lo, hi, scheme, ...exprTriggers],
                      getLineColor: [lo, hi, scheme],
                      getElevation: [lo, hi, extruded, ...exprTriggers],
                    },
```

(`getLineColor` keeps its existing value-based accessor in v1.)

- [ ] **Step 8: Wire the geojson fallback layer**

In the `GeoJsonLayer` block, replace `getFillColor` / `getLineColor` stays / `getElevation` with the JS-row adapters (features expose columns via `.properties`, which `jsRow` handles):

```ts
                getFillColor: exprs.fill
                  ? (f: any) => normalizeExpressionColor(safeEvalExpression(exprs.fill!, jsRow(f)), ramp, [100, 150, 255, 120])
                  : (f: any) => {
                      const v = f.properties?.value;
                      return v != null ? valueToColor(v, lo, hi, scheme) : [100, 150, 255, 120];
                    },
```

```ts
                getElevation: exprs.elevation
                  ? (f: any) => (extruded ? (normalizeExpressionNumber(safeEvalExpression(exprs.elevation!, jsRow(f))) ?? 0) : 0)
                  : (f: any) => {
                      if (!extruded) return 0;
                      const v = f.properties?.value;
                      if (v == null) return 0;
                      const range = hi - lo || 1;
                      return ((v - lo) / range) * 500;
                    },
```

and add `...exprTriggers` to its `getFillColor` / `getElevation` updateTriggers arrays (leave `getLineColor` triggers as-is).

The `arc` case gets no changes (documented non-goal).

- [ ] **Step 9: Typecheck and lint**

```bash
pnpm lint:fix && pnpm build
```

Expected: Biome clean; `tsc`/Vite build succeeds. (`pnpm test` also still green.)

- [ ] **Step 10: Commit**

```bash
git add src/components/tambo/geo-map-deckgl.tsx
git commit -m "feat(map): expression-driven fill/elevation/radius accessors on all layer paths"
```

---

### Task 4: Schema + plumbing in geo-map.tsx

**Files:**
- Modify: `src/components/tambo/geo-map.tsx`

- [ ] **Step 1: Add the import**

```ts
import { evaluateExpressionStats } from "@/services/geo/style-expressions";
```

- [ ] **Step 2: Add the shared schema fields**

Define once above `layerEntrySchema` (`geo-map.tsx:15`):

```ts
const EXPRESSION_SYNTAX =
  "Restricted JS over the query result columns (EXACT case-sensitive names, e.g. USP_TX_DEN). " +
  "Allowed: arithmetic, comparisons, ternary, && || !, array literals. NO function calls. " +
  "Alias non-identifier column names in SQL first.";

const styleExpressionFields = {
  fillColorExpression: z
    .string()
    .optional()
    .describe(
      `Per-feature color expression. ${EXPRESSION_SYNTAX} ` +
        "Return a NUMBER to ramp it through colorScheme (legend follows), or an [r,g,b] / [r,g,b,a] array (0-255) for explicit categorical colors. " +
        'Example: "USP_TX_DEN > 50 ? [215,48,39,200] : [5,113,176,160]". Overrides valueColumn coloring. Not supported on arc layers.',
    ),
  elevationExpression: z
    .string()
    .optional()
    .describe(
      `Per-feature extrusion height expression (number). Requires extruded=true. ${EXPRESSION_SYNTAX} Example: "n_floors * 100".`,
    ),
  radiusExpression: z
    .string()
    .optional()
    .describe(
      `Per-feature point radius in meters (number). Scatterplot/point layers only. ${EXPRESSION_SYNTAX} Example: "population / 100".`,
    ),
};
```

Spread into BOTH schemas: in `layerEntrySchema` after `opacity`/before `visible`, and in `geoMapSchema` after `colorScheme`:

```ts
  ...styleExpressionFields,
```

- [ ] **Step 3: Plumb through transformQueryToLayer**

Add to its `opts` type (after `opacity?: ColorScheme` line group):

```ts
    fillColorExpression?: string;
    elevationExpression?: string;
    radiusExpression?: string;
```

Immediately after the empty-rows early return (`geo-map.tsx:295-297`), add the legend stats:

```ts
  // Fill expression legend/ramp domain: numeric expressions drive min/max,
  // explicit-color expressions have no scalar domain (gradient legend hidden).
  const exprStats = opts.fillColorExpression ? evaluateExpressionStats(rows, opts.fillColorExpression) : null;
  const legendValues = (vals: number[]) => (exprStats ? (exprStats.kind === "number" ? exprStats.values : []) : vals);
```

In the **WKB branch**, replace:

```ts
    const { min, max } = computePercentileRange(vals);
```

with:

```ts
    const effectiveVals = legendValues(vals);
    const { min, max } = computePercentileRange(effectiveVals);
```

and in its returned `layerConfig` add the three fields + switch `values`:

```ts
        fillColorExpression: opts.fillColorExpression,
        elevationExpression: opts.elevationExpression,
        radiusExpression: opts.radiusExpression,
```

(placed after `opacity: opts.opacity,`), and change `values: vals,` → `values: effectiveVals,`.

At the **bottom of the function**, make the same change: replace `const { min, max } = computePercentileRange(vals);` with the `effectiveVals` pair, add the three fields to the returned `layerConfig` (after `opacity: opts.opacity,`), and change `values: vals,` → `values: effectiveVals,`.

- [ ] **Step 4: Full-row data for the scatterplot fallback**

In the `scatterplot` case of `transformQueryToLayer`, replace:

```ts
          const item: any = { lat, lng, value: numVal };
```

with:

```ts
          // Full row spread so style expressions can reference any result column
          const item: any = { ...row, lat, lng, value: numVal };
```

- [ ] **Step 5: Pass the props through both call sites**

Destructure in the component (`geo-map.tsx:498-521`), after `basemap`:

```ts
    fillColorExpression,
    elevationExpression,
    radiusExpression,
```

Multi-layer call site: inside the `transformQueryToLayer(timeFilteredRows, { ... })` opts in the multi-layer loop, add:

```ts
            fillColorExpression: layer.fillColorExpression,
            elevationExpression: layer.elevationExpression,
            radiusExpression: layer.radiusExpression,
```

Single-layer call site: in its opts, add:

```ts
            fillColorExpression,
            elevationExpression,
            radiusExpression,
```

Add the three identifiers to the big `useMemo` dependency array (after `colorScheme,`):

```ts
    fillColorExpression,
    elevationExpression,
    radiusExpression,
```

Also add them to the `synthesizedLayer` useMemo object + deps so the layer-control synthesis stays consistent:

object: after `colorMetric: colorMetric ?? undefined,` add

```ts
      fillColorExpression,
      elevationExpression,
      radiusExpression,
```

deps: append `fillColorExpression, elevationExpression, radiusExpression,`.

- [ ] **Step 6: Update the interactable description**

In `InteractableGeoMap`'s `description` (`geo-map.tsx:1327`), append before the final sentence:

```
"Per-feature conditional styling: set fillColorExpression (number → colorScheme ramp, or [r,g,b,a] array for categorical colors), elevationExpression, radiusExpression - restricted JS over EXACT result column names, no function calls. " +
"When the user asks to highlight/flag/categorize features by a condition (e.g. 'make buildings over 50m red'), use fillColorExpression, not valueColumn. " +
```

- [ ] **Step 7: Lint, test, build**

```bash
pnpm lint:fix && pnpm test && pnpm build
```

Expected: all green.

- [ ] **Step 8: Commit**

```bash
git add src/components/tambo/geo-map.tsx
git commit -m "feat(map): fillColor/elevation/radius expression props on GeoMap schema"
```

---

### Task 5: AI guidance (component tips)

**Files:**
- Modify: `src/lib/tambo/context/component-tips.ts`

- [ ] **Step 1: Extend the GeoMap tip**

Replace the GeoMap entry (`component-tips.ts:13`) with:

```ts
    // GeoMap
    "GeoMap: pass queryId. A SELECT that returns a GEOMETRY column auto-renders as map features. Set basemap='auto'. Reproject to EPSG:4326 for display as described in the DuckDB notes.",
    "GeoMap conditional styling: fillColorExpression / elevationExpression / radiusExpression take a restricted JS expression over the result columns (EXACT case-sensitive names from describeDataset; no function calls; alias awkward names in SQL). " +
      "fillColorExpression returning a number ramps through colorScheme; returning [r,g,b] or [r,g,b,a] (0-255) sets explicit colors - ideal for highlight/threshold/category requests, " +
      'e.g. fillColorExpression="USP_TX_DEN > 50 ? [215,48,39,200] : [5,113,176,160]". ' +
      "Only reference columns present in the SELECT result. Not available on arc layers.",
```

- [ ] **Step 2: Lint + commit**

```bash
pnpm lint:fix
git add src/lib/tambo/context/component-tips.ts
git commit -m "feat(map): teach AI the GeoMap style expression syntax"
```

---

### Task 6: Verification + docs sync

**Files:**
- Modify: `CLAUDE.md`
- Modify: `.claude/rules/components.md`

- [ ] **Step 1: Full verification**

```bash
pnpm lint && pnpm test && pnpm build
```

Expected: Biome clean, all vitest suites pass, production build succeeds. Sanity-check the build output: the main chunk should grow only marginally (jsep + the @deck.gl/json expression helper are small; JSONConverter should tree-shake out).

- [ ] **Step 2: Manual smoke test (recommended)**

```bash
pnpm dev
```

In `localhost:5173/portolan-ai/madrid`, ask for a map, then: "make parcels with USP_TX_DEN above 50 red and the rest blue". Verify the AI sets `fillColorExpression`, polygons recolor without a layer remount, the gradient legend hides (explicit colors), and tooltips/cross-filter still work. Then ask a numeric variant ("color by USP_TX_DEN times 2") and confirm the legend min/max follows the expression values.

- [ ] **Step 3: Update CLAUDE.md**

In the "Current Interactable Components" table, GeoMap row, "AI Can Update" cell: append `, fillColorExpression, elevationExpression, radiusExpression` after `layers[]`.

In the "Multi-Layer GeoMap" section, append:

```
**Style expressions**: `fillColorExpression` / `elevationExpression` / `radiusExpression` (top-level and per-layer) are restricted JS expressions over result columns, compiled by `src/services/geo/style-expressions.ts` via `_parseExpressionString` from `@deck.gl/json` (jsep AST eval, function calls blocked). Numbers ramp through colorScheme (legend follows the expression's percentile range), `[r,g,b,a]` arrays are explicit colors (gradient legend hidden). GeoArrow layers evaluate expressions per feature through `makeArrowRowReader` (reads only the referenced Arrow columns - zero-copy pipeline untouched). Bad expressions degrade to valueColumn styling, never a blank map. Arc layers unsupported.
```

- [ ] **Step 4: Update .claude/rules/components.md**

In the GeoMap paragraph, after the multi-layer sentence, add:

```
Style expressions: `fillColorExpression`/`elevationExpression`/`radiusExpression` (top-level + per-layer) - restricted JS over exact result column names (`src/services/geo/style-expressions.ts`, jsep-based, no function calls). Number results ramp through colorScheme and drive the legend domain; `[r,g,b,a]` results are explicit colors (gradient legend hidden, count still shown). GeoArrow accessors read only the referenced columns via `makeArrowRowReader` (zero-copy preserved); JS-object layers evaluate over `d.properties ?? d`. Expression strings are in every relevant `updateTriggers` array. Arc layers: no expression support.
```

- [ ] **Step 5: Final commit**

```bash
git add CLAUDE.md .claude/rules/components.md
git commit -m "docs: document GeoMap style expressions"
```

---

## Self-Review Notes

- **Spec coverage:** expression language → Task 2; field semantics incl. legend behavior → Tasks 2+4; layer coverage table → Task 3 (steps 4-8 map 1:1 to the table rows); error policy → Task 2 (`compileExpression` null + `safeEvalExpression`) and the `?? fallback` adapters in Task 3; zero-copy preservation → `makeArrowRowReader` (Task 2) + per-layer `readRow` closures (Task 3); AI guidance → Tasks 4 (schema/description) + 5 (tips); docs → Task 6.
- **Type consistency:** `CompiledExpression`, `RGBA`, `makeArrowRowReader`, `normalizeExpressionColor(result, ramp, fallback)`, `safeEvalExpression(compiled, row)` are used with identical signatures in Tasks 2, 3 and the tests in Task 1.
- **Known risk:** `_parseExpressionString` is an experimental export; Task 2 carries an explicit contingency (vendor jsep evaluator behind the same module API; tests unchanged).
- **Deliberately untouched:** cross-filter, time filter, viewport/layer persistence (expressions are stateless accessor inputs and are NOT stored in `LayerOverride`), Arc layers, line colors.
