# Unified color encoding for GeoMap

Date: 2026-06-13
Status: Approved, ready for implementation plan

## Problem

The GeoMap fill and its legend are computed by two unrelated code paths that re-derive
color from the same props. They drift apart. The visible symptom was a categorical map
(an explicit-color `fillColorExpression` painting counties red, orange, tan, blue) sitting
under a continuous viridis population gradient in the legend. The map was honest about the
expression, the legend was honest about `colorScheme` plus the value column, and nothing
reconciled the two.

### Where the drift comes from today

- Fill color lives in `geo-map-deckgl.tsx` `buildLayers`. For polygons it calls
  `valueToColor(v, lo, hi, scheme)` over the `SCHEMES` palette, or runs `fillColorExpression`
  per feature where the result can be an explicit `[r,g,b,a]` array that ignores the scheme.
- Legend lives in `geo-map.tsx` around lines 1209 to 1253. It draws `LEGEND_GRADIENTS[colorScheme]`
  between a min and a max. It has no knowledge of `fillColorExpression`.
- The guard meant to hide the gradient for explicit-color expressions is
  `evaluateExpressionStats` plus `legendValues` in `transformQueryToLayer`
  (`geo-map.tsx` lines 335 to 342). It only fires when a sampled feature evaluates to an
  array, so a numeric or skipped branch leaves the value gradient on screen.
- The single-layer legend reads the top-level `colorScheme` prop while the multi-layer
  legend reads `entry.colorScheme`. Two more paths that can diverge.

## Goals

1. One source of truth for fill color per layer.
2. The map fill and the legend always agree, by construction.
3. No change to how the AI sets style. It keeps using the existing flat props.
4. A clear rule for where and when deck.gl reads color, with the zero-copy pipeline intact.

## Non-goals

- No change to the AI-facing schema or tool descriptions. The flat props stay.
- `elevationExpression` and `radiusExpression` are out of scope. They are plain per-feature
  accessors with no legend to fall out of sync with.
- No new color schemes or expression features.

## Design

### The single value

One value per layer, a `ColorResolution`, computed once and read by both deck.gl and the legend.

```ts
// src/services/geo/color-encoding.ts
export type RGBA = [number, number, number, number];

export type ColorResolution = {
  // Always present. deck.gl reads these to build its per-feature accessor and its
  // numeric fallback ramp, even in the swatches case.
  scheme: ColorScheme;
  domain: [number, number];
  label?: string;
  // Drives the legend only.
  legend:
    | { kind: "gradient" }
    | { kind: "swatches"; items: { color: RGBA; count: number }[] };
};

export function resolveColorEncoding(
  rows: Record<string, unknown>[],
  opts: {
    colorScheme: ColorScheme;
    valueColumn: string;
    fillColorExpression?: string;
    colorMetric?: string;
  },
): ColorResolution;
```

The resolution always carries `scheme` and `domain` so deck.gl has one source for the ramp
and for the numeric fallback. The `legend` field is the only thing the legend renderer reads,
and it folds the four current fill scenarios into two shapes.

- No expression. The value column ramps through the scheme. `legend.kind` is `gradient`, and
  the domain is the percentile range (reusing the existing `computePercentileRange` logic).
- Expression returns numbers. It ramps through the scheme. `legend.kind` is `gradient`, and
  the domain is the expression's own numeric range.
- Invalid expression. It degrades to the value column. `legend.kind` is `gradient`.
- Expression returns arrays. Explicit colors. `legend.kind` is `swatches`. The resolver
  evaluates the expression across features, buckets the distinct colors, and counts features
  per color. `scheme` and `domain` still come from the value column so deck.gl's numeric
  fallback ramp stays sensible.

The `label` carries `colorMetric` so the legend renderer needs no other input.

### Data flow

```
transformQueryToLayer (geo-map.tsx)
   └─ resolveColorEncoding(rows, opts) ─► ColorResolution
          stored on LayerConfig.colorResolution
                 │                                   │
                 ▼                                   ▼
   DeckGLMap buildLayers                       GeoMap legend
   reads .scheme + .domain                     reads the union
   to build the Arrow / JS                     gradient -> gradient bar
   getFillColor accessor                       swatches -> color chips + counts
```

Both sides read the same object. They cannot disagree. That is the fix.

### Where deck.gl reads it, zero-copy preserved

deck.gl does not receive a ready-made `getFillColor` function, because its fast path reads
Arrow columns directly and a generic function over JS rows would break that. deck.gl reads
`colorResolution.scheme` and `colorResolution.domain` and builds its own per-feature accessor
exactly as it does now, through `makeArrowRowReader` for the GeoArrow path and `jsRow` for the
fallback. The only change is that the `lo`, `hi`, and `scheme` it feeds into `valueToColor`
come from the shared resolution rather than from separate `minVal`, `maxVal`, and `colorScheme`
arguments. The GeoArrow zero-copy pipeline is untouched.

For the swatches case deck.gl already paints correct colors, because it runs the same
`fillColorExpression` per feature through `normalizeExpressionColor`. The resolution does not
change the painted pixels there. It only changes what the legend draws.

### Legend rendering

The legend in `geo-map.tsx` switches on `layerConfig.colorResolution.legend.kind`.

- `gradient` renders the existing min, gradient bar, max, plus the label, using `scheme` and
  `domain` from the resolution.
- `swatches` renders a row of color chips, each with its feature count, plus the label. No
  gradient bar.

Single-layer and multi-layer both read the per-layer resolution, so the two legend paths
become one path applied per visible layer.

### What this removes

- The `legendValues` plus `evaluateExpressionStats` color versus number versus invalid
  branching inside `transformQueryToLayer` collapses into the resolver.
- The separate `minVal` and `maxVal` and `colorScheme` plumbing into the legend is replaced
  by the resolution.
- The single-layer versus multi-layer legend split disappears.

## Affected files

- New `src/services/geo/color-encoding.ts`. The resolver and the `ColorResolution` type.
- New `src/services/geo/color-encoding.test.ts`. Branch coverage.
- `src/components/tambo/geo-map.tsx`. `transformQueryToLayer` calls the resolver and stores
  the result on the layer config. The legend renders from it. The old `legendValues` and the
  single versus multi legend split are removed.
- `src/components/tambo/geo-map-deckgl.tsx`. `LayerConfig` gains `colorResolution`.
  `buildLayers` reads scheme and domain from it. `valueToColor` and `SCHEMES` stay.
- `src/services/geo/style-expressions.ts`. `evaluateExpressionStats` may move or be wrapped
  by the resolver. `compileExpression`, `safeEvalExpression`, `normalizeExpressionColor`, and
  `makeArrowRowReader` are unchanged.

## Testing

`color-encoding.test.ts` covers each branch.

- A value column ramp returns `legend.kind` gradient with the percentile domain.
- A numeric expression returns `legend.kind` gradient with the expression domain.
- An explicit-color expression returns `legend.kind` swatches with the right distinct colors
  and counts, and still carries a sensible value-column `scheme` and `domain`.
- An invalid expression degrades to a value-domain gradient.
- Empty data returns a stable, safe resolution.

The existing `style-expressions.test.ts` stays for the lower-level eval. Existing GeoMap
behavior is verified by running the app on the Finland wellbeing-counties question and
confirming the legend matches the painted fill in both the ramp and the categorical case.

## Risks

- The swatch legend evaluates the expression across features to bucket colors. This runs
  over `rows`, which already exist alongside `wkbArrays`, so no new data path is needed. For
  very high-cardinality expressions the swatch row could grow long. Counts are bucketed by
  exact color, and catalog categorical expressions return a small fixed palette, so this is
  acceptable. If it ever bites, capping the distinct count is a later follow-up.
