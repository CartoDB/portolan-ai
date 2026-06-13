/**
 * Single source of truth for GeoMap fill color and its legend.
 *
 * resolveColorEncoding() runs ONCE per layer and returns a ColorResolution that
 * both deck.gl (geo-map-deckgl.tsx, via scheme + domain) and the legend
 * (geo-map.tsx, via the legend field) read. They cannot drift because they read
 * the same object.
 */
import { compileExpression, type RGBA, safeEvalExpression } from "./style-expressions";

export type ColorScheme =
  | "blue-red"
  | "viridis"
  | "plasma"
  | "warm"
  | "cool"
  | "spectral"
  | "inferno"
  | "magma"
  | "cividis"
  | "turbo";

/**
 * Canonical color stops per scheme. THE one table that turns a scheme name into
 * pixels. deck.gl ramps the fill through these (valueToColor) and the legend builds
 * its gradient bar from these (schemeToCssGradient), so the painted map and the
 * legend can never show different colors for the same scheme.
 *
 * Stops are accurate matplotlib / ColorBrewer values sampled at 16 evenly-spaced
 * points, extracted from developmentseed/deck.gl-raster's colormaps.png sprite.
 * Both readers assume even spacing (valueToColor: idx = t * (stops.length - 1);
 * schemeToCssGradient emits position-less CSS stops), so this list must stay
 * evenly spaced. blue-red is RdYlBu (blue->red), warm is YlOrRd, cool is BuGn,
 * spectral is Spectral (purple->red).
 */
export const SCHEMES: Record<ColorScheme, [number, number, number][]> = {
  "blue-red": [
    [49, 54, 149],
    [62, 96, 169],
    [84, 135, 189],
    [116, 173, 209],
    [152, 202, 225],
    [188, 225, 238],
    [224, 243, 247],
    [244, 251, 210],
    [254, 244, 175],
    [254, 224, 144],
    [253, 190, 112],
    [250, 152, 86],
    [244, 109, 67],
    [224, 68, 48],
    [198, 32, 38],
    [165, 0, 38],
  ],
  viridis: [
    [68, 1, 84],
    [72, 25, 107],
    [70, 47, 124],
    [64, 67, 135],
    [56, 86, 139],
    [48, 103, 141],
    [41, 120, 142],
    [35, 136, 141],
    [30, 152, 138],
    [34, 167, 132],
    [53, 183, 120],
    [83, 197, 103],
    [121, 209, 81],
    [165, 218, 53],
    [210, 225, 27],
    [253, 231, 36],
  ],
  plasma: [
    [12, 7, 134],
    [51, 4, 151],
    [79, 2, 162],
    [106, 0, 167],
    [132, 5, 166],
    [155, 23, 158],
    [176, 42, 143],
    [194, 61, 128],
    [210, 80, 112],
    [224, 100, 97],
    [236, 120, 83],
    [246, 142, 68],
    [252, 166, 53],
    [253, 192, 41],
    [249, 219, 36],
    [239, 248, 33],
  ],
  warm: [
    [255, 255, 204],
    [255, 245, 180],
    [254, 235, 157],
    [254, 225, 134],
    [254, 211, 112],
    [254, 191, 90],
    [253, 170, 72],
    [253, 150, 64],
    [252, 124, 55],
    [252, 90, 45],
    [243, 60, 37],
    [230, 32, 29],
    [211, 15, 32],
    [191, 1, 37],
    [160, 0, 38],
    [128, 0, 38],
  ],
  cool: [
    [247, 252, 253],
    [237, 248, 250],
    [227, 244, 247],
    [214, 239, 237],
    [197, 233, 226],
    [170, 222, 210],
    [142, 211, 193],
    [115, 199, 173],
    [92, 188, 151],
    [72, 178, 127],
    [55, 162, 101],
    [39, 143, 75],
    [21, 126, 58],
    [2, 111, 45],
    [0, 89, 36],
    [0, 68, 27],
  ],
  spectral: [
    [94, 79, 162],
    [64, 117, 180],
    [67, 155, 181],
    [102, 194, 165],
    [148, 212, 164],
    [190, 229, 160],
    [230, 245, 152],
    [246, 251, 178],
    [254, 244, 173],
    [254, 224, 139],
    [253, 190, 110],
    [250, 152, 86],
    [244, 109, 67],
    [223, 77, 75],
    [194, 41, 74],
    [158, 1, 66],
  ],
  inferno: [
    [0, 0, 3],
    [11, 7, 38],
    [36, 11, 78],
    [65, 9, 103],
    [93, 18, 110],
    [120, 28, 109],
    [147, 37, 103],
    [174, 48, 91],
    [199, 62, 76],
    [220, 80, 57],
    [237, 104, 37],
    [247, 133, 14],
    [251, 164, 10],
    [249, 197, 44],
    [242, 230, 96],
    [252, 254, 164],
  ],
  magma: [
    [0, 0, 3],
    [11, 8, 36],
    [31, 17, 75],
    [59, 15, 111],
    [87, 20, 125],
    [113, 31, 129],
    [140, 41, 128],
    [167, 49, 125],
    [195, 59, 116],
    [221, 73, 104],
    [240, 96, 93],
    [250, 127, 94],
    [253, 159, 108],
    [254, 190, 131],
    [253, 221, 159],
    [251, 252, 191],
  ],
  cividis: [
    [0, 34, 77],
    [0, 46, 107],
    [29, 57, 110],
    [53, 69, 108],
    [71, 81, 107],
    [87, 93, 109],
    [102, 105, 112],
    [116, 117, 117],
    [132, 129, 120],
    [148, 142, 119],
    [165, 155, 115],
    [182, 169, 110],
    [200, 183, 101],
    [218, 198, 90],
    [237, 214, 72],
    [253, 231, 55],
  ],
  turbo: [
    [48, 18, 59],
    [64, 67, 166],
    [70, 112, 232],
    [62, 155, 254],
    [33, 196, 225],
    [26, 228, 182],
    [70, 247, 131],
    [135, 254, 77],
    [185, 245, 52],
    [225, 220, 55],
    [249, 186, 56],
    [253, 140, 39],
    [239, 90, 17],
    [214, 52, 5],
    [174, 24, 1],
    [122, 4, 2],
  ],
};

/** Build the legend's CSS gradient from the SAME stops the fill ramps through. */
export function schemeToCssGradient(scheme: ColorScheme): string {
  const stops = SCHEMES[scheme] ?? SCHEMES["blue-red"];
  const parts = stops.map((c) => `rgb(${c[0]}, ${c[1]}, ${c[2]})`);
  return `linear-gradient(90deg, ${parts.join(", ")})`;
}

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
