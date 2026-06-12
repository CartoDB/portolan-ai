import { Decimal, makeData, makeVector } from "apache-arrow";
import { describe, expect, it } from "vitest";
import { arrowToJs } from "./duckdb-wasm";

/** Build a real apache-arrow Decimal (HUGEINT-style) value, exactly as DuckDB-WASM surfaces SUM(BIGINT). */
function decimalValue(int128LeWords: [number, number, number, number], scale = 0): unknown {
  const type = new Decimal(scale, 38, 128);
  const data = makeData({ type, length: 1, nullCount: 0, data: new Uint32Array(int128LeWords) });
  return makeVector(data).get(0);
}

describe("arrowToJs", () => {
  it("converts an Arrow Decimal/HUGEINT bignum to a finite number (not a quoted string)", () => {
    // SUM(vaesto) widened to HUGEINT → Decimal(38,0). 19562 as int128 little-endian.
    const v = decimalValue([19562, 0, 0, 0]);
    expect(arrowToJs(v)).toBe(19562);
  });

  it("handles a multi-word HUGEINT value", () => {
    // 5_000_000_000 = 0x1_2A05F200 → low word 0x2A05F200, high word 0x1.
    const v = decimalValue([0x2a05f200, 0x1, 0, 0]);
    expect(arrowToJs(v)).toBe(5_000_000_000);
  });

  it("handles negative HUGEINT (two's complement int128)", () => {
    const v = decimalValue([0xffffffec, 0xffffffff, 0xffffffff, 0xffffffff]); // -20
    expect(arrowToJs(v)).toBe(-20);
  });

  it("still converts plain bigint to Number", () => {
    expect(arrowToJs(42n)).toBe(42);
  });

  it("still converts Uint8Array (WKB) to a hex string", () => {
    expect(arrowToJs(new Uint8Array([0xde, 0xad]))).toBe("0xdead");
  });

  it("passes through plain numbers, strings and null", () => {
    expect(arrowToJs(7)).toBe(7);
    expect(arrowToJs("hello")).toBe("hello");
    expect(arrowToJs(null)).toBeNull();
  });

  it("recurses into structs, converting nested Decimal values", () => {
    const v = decimalValue([100, 0, 0, 0]);
    // Plain nested object (no toJSON) path: nested bignum should also become a number.
    expect(arrowToJs({ pop: v, label: "x" })).toEqual({ pop: 100, label: "x" });
  });
});
