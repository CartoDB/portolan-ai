/**
 * Single source of truth for GeoMap fill color and its legend.
 *
 * resolveColorEncoding() runs ONCE per layer and returns a ColorResolution that
 * both deck.gl (geo-map-deckgl.tsx, via scheme + domain) and the legend
 * (geo-map.tsx, via the legend field) read. They cannot drift because they read
 * the same object.
 */
import { compileExpression, type RGBA, safeEvalExpression } from "./style-expressions";

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
