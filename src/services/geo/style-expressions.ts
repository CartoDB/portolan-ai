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
  const seen = new Set<string>();
  const out: string[] = [];
  for (const m of matches) {
    if (!RESERVED.has(m) && !seen.has(m)) {
      seen.add(m);
      out.push(m);
    }
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
    // Skip rows where any referenced identifier is null/undefined to avoid
    // spurious results such as null * 2 === 0 polluting the domain.
    if (compiled.identifiers.some((id) => row[id] == null)) continue;
    const r = safeEvalExpression(compiled, row);
    if (r == null) continue;
    if (typeof r === "number" || typeof r === "bigint") {
      const n = Number(r);
      if (Number.isFinite(n)) {
        kind = "number";
        values.push(n);
      }
    } else if (Array.isArray(r)) {
      // One color array result is enough to classify the whole expression.
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
