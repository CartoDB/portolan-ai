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
