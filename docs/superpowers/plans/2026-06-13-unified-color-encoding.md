# Unified Color Encoding Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make the GeoMap fill and its legend read one shared `ColorResolution` per layer so they can never drift apart.

**Architecture:** A new pure module `src/services/geo/color-encoding.ts` exports `resolveColorEncoding(rows, opts)` returning a `ColorResolution` (always carries `scheme` and `domain` for deck.gl, plus a `legend` descriptor that is either a gradient or color swatches). `transformQueryToLayer` computes it once and stores it on the layer config. deck.gl reads `scheme` and `domain` from it to build the fill accessor. The legend renders from the `legend` field. One computation, two readers.

**Tech Stack:** TypeScript, React 19, Vite, Vitest, deck.gl, @geoarrow/deck.gl-geoarrow, Zod, Tambo.

---

## File structure

- **Create** `src/services/geo/color-encoding.ts` — owns `ColorScheme`, `computePercentileRange`, `ColorResolution`, `resolveColorEncoding`. Pure, no React, no deck.gl.
- **Create** `src/services/geo/color-encoding.test.ts` — branch coverage for the resolver.
- **Modify** `src/components/tambo/geo-map-deckgl.tsx` — add `colorResolution` to `LayerConfig`, read `scheme`/`domain` from it in `buildLayers`, re-export `ColorScheme` from the new module.
- **Modify** `src/components/tambo/geo-map.tsx` — call the resolver in `transformQueryToLayer`, build one unified legend entry list for single and multi layer, render gradient or swatches, drop the old `legendValues` and `computePercentileRange` local copy and the single-versus-multi legend split.

Sequencing: Task 1 (pure module + tests) → Task 2 (deck.gl reads resolution) → Task 3 (resolver wired into transform) → Task 4 (unified legend render) → Task 5 (verify in the app).

---

## Task 1: Pure color-encoding module

**Files:**
- Create: `src/services/geo/color-encoding.ts`
- Test: `src/services/geo/color-encoding.test.ts`

- [ ] **Step 1: Write the failing tests**

Create `src/services/geo/color-encoding.test.ts`:

```ts
import { describe, expect, it } from "vitest";
import { computePercentileRange, resolveColorEncoding } from "./color-encoding";

describe("computePercentileRange", () => {
  it("returns 0..1 for empty input", () => {
    expect(computePercentileRange([])).toEqual({ min: 0, max: 1 });
  });

  it("spreads a flat array by 1", () => {
    expect(computePercentileRange([5, 5, 5])).toEqual({ min: 5, max: 6 });
  });
});

describe("resolveColorEncoding", () => {
  const rows = Array.from({ length: 20 }, (_, i) => ({ pop: i * 100, cat: i % 2 }));

  it("no expression → value-column gradient", () => {
    const r = resolveColorEncoding(rows, { colorScheme: "viridis", valueColumn: "pop", colorMetric: "Population" });
    expect(r.scheme).toBe("viridis");
    expect(r.legend.kind).toBe("gradient");
    expect(r.label).toBe("Population");
    expect(r.domain[0]).toBeLessThan(r.domain[1]);
  });

  it("numeric expression → gradient over the expression domain", () => {
    const r = resolveColorEncoding(rows, { colorScheme: "plasma", valueColumn: "pop", fillColorExpression: "pop * 2" });
    expect(r.legend.kind).toBe("gradient");
    // expression domain (pop*2) is wider than the raw pop domain
    expect(r.domain[1]).toBeGreaterThan(computePercentileRange(rows.map((x) => x.pop)).max);
  });

  it("explicit-color expression → swatches with distinct colors and counts", () => {
    const r = resolveColorEncoding(rows, {
      colorScheme: "blue-red",
      valueColumn: "pop",
      fillColorExpression: "cat > 0 ? [255,0,0] : [0,0,255]",
    });
    expect(r.legend.kind).toBe("swatches");
    if (r.legend.kind !== "swatches") throw new Error("expected swatches");
    expect(r.legend.items).toHaveLength(2);
    const total = r.legend.items.reduce((n, it) => n + it.count, 0);
    expect(total).toBe(20);
    // still carries a usable value-column domain for the deck.gl fallback ramp
    expect(r.domain[0]).toBeLessThan(r.domain[1]);
  });

  it("invalid expression → value-column gradient", () => {
    const r = resolveColorEncoding(rows, { colorScheme: "cool", valueColumn: "pop", fillColorExpression: "][" });
    expect(r.legend.kind).toBe("gradient");
  });

  it("empty data → stable gradient resolution", () => {
    const r = resolveColorEncoding([], { colorScheme: "warm", valueColumn: "pop" });
    expect(r.legend.kind).toBe("gradient");
    expect(r.domain).toEqual([0, 1]);
  });
});
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `pnpm test src/services/geo/color-encoding.test.ts`
Expected: FAIL, cannot resolve `./color-encoding`.

- [ ] **Step 3: Write the module**

Create `src/services/geo/color-encoding.ts`:

```ts
/**
 * Single source of truth for GeoMap fill color and its legend.
 *
 * resolveColorEncoding() runs ONCE per layer and returns a ColorResolution that
 * both deck.gl (geo-map-deckgl.tsx, via scheme + domain) and the legend
 * (geo-map.tsx, via the legend field) read. They cannot drift because they read
 * the same object.
 */
import { type RGBA, compileExpression, safeEvalExpression } from "./style-expressions";

export type ColorScheme = "blue-red" | "viridis" | "plasma" | "warm" | "cool" | "spectral";

/** 5th/95th percentile range, clamping outliers. Flat arrays spread by 1. */
export function computePercentileRange(values: number[]): { min: number; max: number } {
  if (values.length === 0) return { min: 0, max: 1 };
  const sorted = [...values].sort((a, b) => a - b);
  const lo = sorted[Math.floor(sorted.length * 0.05)];
  const hi = sorted[Math.floor(sorted.length * 0.95)];
  if (lo === hi) return { min: lo, max: lo + 1 };
  return { min: lo, max: hi };
}

export type ColorResolution = {
  /** deck.gl reads these to build its per-feature accessor and numeric fallback ramp. */
  scheme: ColorScheme;
  domain: [number, number];
  /** Legend label, sourced from colorMetric. */
  label?: string;
  /** The legend renderer reads ONLY this. */
  legend: { kind: "gradient" } | { kind: "swatches"; items: { color: RGBA; count: number }[] };
};

function toNum(v: unknown): number {
  return typeof v === "bigint" ? Number(v) : Number(v);
}

function clampChannel(c: number): number {
  return Math.max(0, Math.min(255, Math.round(c)));
}

function isColorArray(r: unknown): r is number[] {
  return (
    Array.isArray(r) &&
    (r.length === 3 || r.length === 4) &&
    r.every((c) => typeof c === "number" && Number.isFinite(c))
  );
}

function normColor(a: number[]): RGBA {
  return [clampChannel(a[0]), clampChannel(a[1]), clampChannel(a[2]), a.length === 4 ? clampChannel(a[3]) : 200];
}

export function resolveColorEncoding(
  rows: Record<string, unknown>[],
  opts: { colorScheme: ColorScheme; valueColumn: string; fillColorExpression?: string; colorMetric?: string },
): ColorResolution {
  const scheme = opts.colorScheme;
  const label = opts.colorMetric || undefined;

  // Value-column domain. Used for the no-expression ramp and as the deck.gl
  // fallback ramp domain when an explicit-color expression drives the fill.
  const valueNums: number[] = [];
  for (const row of rows) {
    const v = row[opts.valueColumn];
    if (v != null) {
      const n = toNum(v);
      if (Number.isFinite(n)) valueNums.push(n);
    }
  }
  const valueDomain = computePercentileRange(valueNums);
  const valueGradient: ColorResolution = {
    scheme,
    domain: [valueDomain.min, valueDomain.max],
    label,
    legend: { kind: "gradient" },
  };

  const compiled = opts.fillColorExpression ? compileExpression(opts.fillColorExpression) : null;
  if (!compiled) return valueGradient; // no expression, or it failed to compile

  const exprNums: number[] = [];
  const buckets = new Map<string, { color: RGBA; count: number }>();
  let sawColor = false;
  for (const row of rows) {
    if (compiled.identifiers.some((id) => row[id] == null)) continue;
    const r = safeEvalExpression(compiled, row);
    if (r == null) continue;
    if (typeof r === "number" || typeof r === "bigint") {
      const n = toNum(r);
      if (Number.isFinite(n)) exprNums.push(n);
    } else if (isColorArray(r)) {
      sawColor = true;
      const color = normColor(r);
      const key = color.join(",");
      const b = buckets.get(key);
      if (b) b.count++;
      else buckets.set(key, { color, count: 1 });
    }
  }

  if (sawColor) {
    const items = [...buckets.values()].sort((a, b) => b.count - a.count);
    return { scheme, domain: [valueDomain.min, valueDomain.max], label, legend: { kind: "swatches", items } };
  }
  if (exprNums.length > 0) {
    const d = computePercentileRange(exprNums);
    return { scheme, domain: [d.min, d.max], label, legend: { kind: "gradient" } };
  }
  return valueGradient; // expression produced nothing usable
}
```

- [ ] **Step 4: Run the tests to verify they pass**

Run: `pnpm test src/services/geo/color-encoding.test.ts`
Expected: PASS, all cases green.

- [ ] **Step 5: Commit**

```bash
git add src/services/geo/color-encoding.ts src/services/geo/color-encoding.test.ts
git commit -m "feat: resolveColorEncoding, single source of truth for GeoMap fill + legend"
```

---

## Task 2: deck.gl reads scheme and domain from the resolution

**Files:**
- Modify: `src/components/tambo/geo-map-deckgl.tsx:29` (ColorScheme re-export)
- Modify: `src/components/tambo/geo-map-deckgl.tsx:33-66` (LayerConfig field)
- Modify: `src/components/tambo/geo-map-deckgl.tsx:488-490` (lo/hi/scheme source)

- [ ] **Step 1: Re-export ColorScheme from the new module**

Replace line 29:

```ts
export type ColorScheme = "blue-red" | "viridis" | "plasma" | "warm" | "cool" | "spectral";
```

with:

```ts
export type { ColorScheme } from "@/services/geo/color-encoding";
```

Then add this import near the other imports at the top of the file (alongside the existing `@/services/geo/style-expressions` import):

```ts
import type { ColorResolution } from "@/services/geo/color-encoding";
```

- [ ] **Step 2: Add colorResolution to LayerConfig**

In the `LayerConfig` interface (starts at line 33), add the field directly under `maxVal?: number;` (line 40):

```ts
  minVal?: number;
  maxVal?: number;
  /** Single source of truth for fill color + legend, from resolveColorEncoding(). */
  colorResolution?: ColorResolution;
```

- [ ] **Step 3: Read lo/hi/scheme from the resolution in buildLayers**

Replace the three lines at 488-490:

```ts
    const scheme = config.colorScheme ?? colorScheme;
    const lo = config.minVal ?? minVal;
    const hi = config.maxVal ?? maxVal;
```

with:

```ts
    // Single source of truth: when a resolution is present, fill scheme + domain
    // come from it (the same object the legend reads), so the two cannot drift.
    const res = config.colorResolution;
    const scheme = res?.scheme ?? config.colorScheme ?? colorScheme;
    const lo = res ? res.domain[0] : (config.minVal ?? minVal);
    const hi = res ? res.domain[1] : (config.maxVal ?? maxVal);
```

- [ ] **Step 4: Typecheck**

Run: `pnpm build`
Expected: build succeeds, no TypeScript errors. (No behavior change yet because nothing sets `colorResolution` until Task 3. The fill still uses `config.minVal`/`maxVal`/`colorScheme` via the fallbacks.)

- [ ] **Step 5: Commit**

```bash
git add src/components/tambo/geo-map-deckgl.tsx
git commit -m "feat: deck.gl reads fill scheme + domain from ColorResolution when present"
```

---

## Task 3: Wire the resolver into transformQueryToLayer

**Files:**
- Modify: `src/components/tambo/geo-map.tsx:7` (imports)
- Modify: `src/components/tambo/geo-map.tsx:191-198` (drop local computePercentileRange)
- Modify: `src/components/tambo/geo-map.tsx:302-326` (opts type: add colorScheme, colorMetric)
- Modify: `src/components/tambo/geo-map.tsx:333-342` (replace legendValues with resolver)
- Modify: `src/components/tambo/geo-map.tsx:362-392` and `:510-532` (attach colorResolution + domain to both return paths)
- Modify: `src/components/tambo/geo-map.tsx:839-862` (single-layer call passes colorScheme + colorMetric)

- [ ] **Step 1: Update imports**

Line 7 currently:

```ts
import { evaluateExpressionStats } from "@/services/geo/style-expressions";
```

Replace with:

```ts
import { type ColorResolution, resolveColorEncoding } from "@/services/geo/color-encoding";
```

(`evaluateExpressionStats` is no longer used here. It stays exported from `style-expressions.ts` with its own test untouched.)

- [ ] **Step 2: Remove the local computePercentileRange and import it instead**

Delete the whole local function at lines 191-198:

```ts
function computePercentileRange(values: number[]): { min: number; max: number } {
  if (values.length === 0) return { min: 0, max: 1 };
  const sorted = [...values].sort((a, b) => a - b);
  const lo = sorted[Math.floor(sorted.length * 0.05)];
  const hi = sorted[Math.floor(sorted.length * 0.95)];
  if (lo === hi) return { min: lo, max: lo + 1 };
  return { min: lo, max: hi };
}
```

Add `computePercentileRange` to the Task 3 Step 1 import so the line reads:

```ts
import { type ColorResolution, computePercentileRange, resolveColorEncoding } from "@/services/geo/color-encoding";
```

(`computePercentileRange` is still referenced elsewhere in this file at the multi-layer legend build, so it must remain importable.)

- [ ] **Step 3: Add colorScheme and colorMetric to the transform opts type**

In the `transformQueryToLayer` opts object type (lines 304-326), add two fields next to the existing `fillColorExpression` style fields:

```ts
    colorScheme?: ColorScheme;
    colorMetric?: string;
```

(`ColorScheme` is already imported at line 9 from `./geo-map-deckgl`. Leave that import as is.)

- [ ] **Step 4: Replace the legendValues block with a single resolver call**

Replace lines 333-342:

```ts
  // Fill expression legend/ramp domain: numeric expressions drive min/max,
  // explicit-color expressions have no scalar domain (gradient legend hidden).
  const exprStats = opts.fillColorExpression ? evaluateExpressionStats(rows, opts.fillColorExpression) : null;
  const legendValues = (vals: number[]) => {
    if (!exprStats) return vals;
    if (exprStats.kind === "number") return exprStats.values;
    if (exprStats.kind === "color") return [];
    // invalid expression: degrade to the data's own valueColumn domain, not 0-1.
    return vals;
  };
```

with:

```ts
  // Single source of truth for fill color + legend (geo-map-deckgl reads scheme +
  // domain from this, the legend reads its legend field). Computed once per layer.
  const colorResolution = resolveColorEncoding(rows, {
    colorScheme: opts.colorScheme ?? "blue-red",
    valueColumn: opts.valueColumn,
    fillColorExpression: opts.fillColorExpression,
    colorMetric: opts.colorMetric,
  });
  const [domainMin, domainMax] = colorResolution.domain;
```

- [ ] **Step 5: Attach colorResolution + domain on the WKB return path**

In the WKB branch, replace lines 360-374 which currently read:

```ts
    const effectiveVals = legendValues(vals);
    const { min, max } = computePercentileRange(effectiveVals);
    return {
      layerConfig: {
        id: opts.id,
        type: "wkb" as LayerType,
        data: [], // WKB path uses wkbArrays, not JS data array
        wkbArrays: opts.wkbArrays,
        colorScheme: opts.colorScheme,
        opacity: opts.opacity,
        fillColorExpression: opts.fillColorExpression,
        elevationExpression: opts.elevationExpression,
        radiusExpression: opts.radiusExpression,
        minVal: min,
        maxVal: max,
```

with:

```ts
    return {
      layerConfig: {
        id: opts.id,
        type: "wkb" as LayerType,
        data: [], // WKB path uses wkbArrays, not JS data array
        wkbArrays: opts.wkbArrays,
        colorScheme: colorResolution.scheme,
        colorResolution,
        opacity: opts.opacity,
        fillColorExpression: opts.fillColorExpression,
        elevationExpression: opts.elevationExpression,
        radiusExpression: opts.radiusExpression,
        minVal: domainMin,
        maxVal: domainMax,
```

Then, in that same return object, the `values:` field (currently `values: effectiveVals,` around line 390) becomes:

```ts
      values: vals,
```

- [ ] **Step 6: Attach colorResolution + domain on the non-WKB return path**

Find the non-WKB return (around lines 510-532). It currently computes:

```ts
  const effectiveVals = legendValues(vals);
  const { min, max } = computePercentileRange(effectiveVals);
```

Replace those two lines with nothing (delete them, the domain now comes from `colorResolution`).

Then in that return object (around lines 515-535), where it currently has `colorScheme: opts.colorScheme,` and `minVal: min,` / `maxVal: max,`, change them to:

```ts
            colorScheme: colorResolution.scheme,
            colorResolution,
```

and

```ts
              minVal: domainMin,
              maxVal: domainMax,
```

Finally, change that path's `values:` return field from `values: effectiveVals,` to:

```ts
      values: vals,
```

- [ ] **Step 7: Pass colorScheme and colorMetric from the single-layer call**

In the single-layer `transformQueryToLayer` call (lines 839-862), add two entries to the opts object, next to `valueColumn,`:

```ts
            valueColumn,
            colorScheme,
            colorMetric: colorMetric ?? undefined,
```

(`colorScheme` and `colorMetric` are already destructured from props earlier in the component at lines 570-571.)

The multi-layer call already passes `colorScheme` (line 805). Add `colorMetric` there too, next to it:

```ts
            colorScheme: (layer.colorScheme as ColorScheme) ?? colorScheme,
            colorMetric: layer.colorMetric,
```

- [ ] **Step 8: Typecheck and run the suite**

Run: `pnpm build && pnpm test`
Expected: build succeeds, all tests pass. The map fill now uses resolution-derived scheme/domain. The legend still uses its old code (changed in Task 4) but min/max it reads are unchanged values, so nothing visually breaks mid-refactor.

- [ ] **Step 9: Commit**

```bash
git add src/components/tambo/geo-map.tsx
git commit -m "feat: compute ColorResolution once in transformQueryToLayer, feed deck.gl from it"
```

---

## Task 4: One unified legend that renders gradient or swatches

**Files:**
- Modify: `src/components/tambo/geo-map.tsx:776` (legends array type)
- Modify: `src/components/tambo/geo-map.tsx:817-830` (multi-layer legend push)
- Modify: `src/components/tambo/geo-map.tsx:865-871` (single-layer legend push)
- Modify: `src/components/tambo/geo-map.tsx:763-769, 887-896` (drop allValues)
- Modify: `src/components/tambo/geo-map.tsx:1000-1001, 1234` (drop allValues reads)
- Modify: `src/components/tambo/geo-map.tsx:1209-1258` (legend JSX)

- [ ] **Step 1: Change the legends entry type to carry the resolution**

Line 776 currently:

```ts
    const legends: { colorScheme: ColorScheme; colorMetric?: string; min: number; max: number; count: number }[] = [];
```

Replace with:

```ts
    const legends: { colorResolution: ColorResolution; count: number }[] = [];
```

- [ ] **Step 2: Push a resolution-based entry in the multi-layer branch**

Lines 817-828 currently:

```ts
        if (result.layerConfig) {
          configs.push(result.layerConfig);
          if (configs.length === 1) firstType = result.type;
          const { min, max } = computePercentileRange(result.values);
          legends.push({
            colorScheme: (layer.colorScheme as ColorScheme) ?? colorScheme,
            colorMetric: layer.colorMetric,
            min,
            max,
            count: result.featureCount,
          });
        }
```

Replace with:

```ts
        if (result.layerConfig) {
          configs.push(result.layerConfig);
          if (configs.length === 1) firstType = result.type;
          if (result.layerConfig.colorResolution) {
            legends.push({ colorResolution: result.layerConfig.colorResolution, count: result.featureCount });
          }
        }
```

(`computePercentileRange` may now be unused in this file. If `pnpm build` reports it unused after this task, remove it from the Task 3 import. The resolver test still imports it from the module directly.)

- [ ] **Step 3: Push a legend entry in the single-layer branch**

Single-layer branch currently (lines 865-871):

```ts
        if (result.layerConfig) {
          configs.push(result.layerConfig);
          firstType = result.type;
        }
        allVals = result.values;
        totalCount = result.featureCount;
```

Replace with:

```ts
        if (result.layerConfig) {
          configs.push(result.layerConfig);
          firstType = result.type;
          if (result.layerConfig.colorResolution) {
            legends.push({ colorResolution: result.layerConfig.colorResolution, count: result.featureCount });
          }
        }
        totalCount = result.featureCount;
```

- [ ] **Step 4: Drop the now-unused allValues plumbing**

Remove the `allVals` accumulator. At line 777 delete:

```ts
    let allVals: number[] = [];
```

In the multi-layer branch remove the line (around 829):

```ts
        allVals = allVals.concat(result.values);
```

In the memo return object (around 887-896) remove the line:

```ts
      allValues: allVals,
```

In the destructure of the memo result (around 763-769) remove:

```ts
    allValues,
```

- [ ] **Step 5: Replace the legend JSX with one resolution-driven renderer**

Replace the whole legend block at lines 1209-1259:

```tsx
      {/* Legend */}
      <div className="px-3 py-1 border-t bg-muted/10 flex flex-col gap-1 flex-shrink-0">
        {isMultiLayer && legendEntries.length > 0 ? (
          /* Multi-layer: stacked legend entries */
          legendEntries.map((entry, i) => (
```

through the closing of that outer div at line 1259, with this single unified block:

```tsx
      {/* Legend - renders from each layer's ColorResolution (gradient or swatches) */}
      <div className="px-3 py-1 border-t bg-muted/10 flex flex-col gap-1 flex-shrink-0">
        {legendEntries.map((entry, i) => {
          const res = entry.colorResolution;
          return (
            <div key={visibleLayers[i]?.id ?? i} className="flex items-center gap-2 flex-wrap">
              {res.legend.kind === "gradient" ? (
                <>
                  <span className="text-xs text-muted-foreground font-mono">
                    {res.domain[0].toLocaleString(undefined, { maximumFractionDigits: 1 })}
                  </span>
                  <div
                    className="flex-1 h-2 rounded-full max-w-[200px]"
                    style={{ background: LEGEND_GRADIENTS[res.scheme] }}
                  />
                  <span className="text-xs text-muted-foreground font-mono">
                    {res.domain[1].toLocaleString(undefined, { maximumFractionDigits: 1 })}
                  </span>
                </>
              ) : (
                <div className="flex items-center gap-1.5 flex-wrap">
                  {res.legend.items.map((it) => (
                    <span key={it.color.join(",")} className="flex items-center gap-1">
                      <span
                        className="inline-block w-3 h-3 rounded-sm border border-border/40"
                        style={{ backgroundColor: `rgba(${it.color[0]},${it.color[1]},${it.color[2]},${it.color[3] / 255})` }}
                      />
                      <span className="text-[10px] text-muted-foreground font-mono">{it.count.toLocaleString()}</span>
                    </span>
                  ))}
                </div>
              )}
              {res.label && (
                <span className="text-[10px] text-muted-foreground uppercase tracking-wider">{res.label}</span>
              )}
              <span className="text-xs text-muted-foreground ml-auto">{entry.count.toLocaleString()}</span>
            </div>
          );
        })}
        {legendEntries.length === 0 && hasData && (
          <div className="flex justify-end">
            <span className="text-xs text-muted-foreground">{countLabel}</span>
          </div>
        )}
      </div>
```

- [ ] **Step 6: Confirm the single-layer legend gate no longer references allValues**

Search the file for `allValues`. There should be zero matches left. The old single-layer gate `{allValues.length > 0 && (` was inside the replaced block, so it is gone. If any reference remains, remove it.

Run: `grep -n "allValues\|allVals" src/components/tambo/geo-map.tsx`
Expected: no output.

- [ ] **Step 7: Lint, typecheck, test**

Run: `pnpm lint && pnpm build && pnpm test`
Expected: biome clean, build succeeds, all tests pass. If biome flags `computePercentileRange` or `ColorScheme` as unused imports, remove them from the import line.

- [ ] **Step 8: Commit**

```bash
git add src/components/tambo/geo-map.tsx
git commit -m "feat: one legend renderer per layer, gradient or categorical swatches from ColorResolution"
```

---

## Task 5: Verify in the running app

**Files:** none (manual verification)

- [ ] **Step 1: Start the dev server**

Run: `pnpm dev`
Expected: serves on `http://localhost:5173/portolan-ai`.

- [ ] **Step 2: Reproduce the original case**

Open the Finland catalog and ask the wellbeing-services-counties population question that produced the screenshot (a county choropleth). Confirm one of these is true and correct:
- The fill is a smooth ramp and the legend gradient uses the same scheme and range, or
- The fill is categorical and the legend now shows color swatches with counts, no false gradient.

Expected: the legend matches the painted map in both cases. No viridis gradient over a non-viridis fill.

- [ ] **Step 3: Check a multi-layer map**

Add a second layer (ask for another dataset on the same map). Confirm each visible layer gets its own legend row, gradient or swatches as appropriate.

Expected: per-layer legend rows, each matching its layer's fill.

- [ ] **Step 4: Check an AI restyle**

Ask the AI to change the color scheme (for example "make it plasma"). Confirm the fill and the legend change together.

Expected: both update to the new scheme in one step.

- [ ] **Step 5: Final confirmation**

Run: `pnpm lint && pnpm test && pnpm build`
Expected: all green. The branch `feat/unified-color-encoding` is ready for review.

---

## Notes for the implementer

- `evaluateExpressionStats` in `style-expressions.ts` is now superseded by `resolveColorEncoding` but is left in place with its existing test. Deleting it is a safe follow-up, out of scope here.
- Do not touch `elevationExpression` or `radiusExpression`. They are out of scope.
- The zero-copy GeoArrow path is unchanged. deck.gl still builds its accessors through `makeArrowRowReader`/`jsRow`. Only the `lo`/`hi`/`scheme` inputs now come from the resolution.
- `LEGEND_GRADIENTS` stays in `geo-map.tsx`. Its keys match the `ColorScheme` union, so `LEGEND_GRADIENTS[res.scheme]` is always defined.
