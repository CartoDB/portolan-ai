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
