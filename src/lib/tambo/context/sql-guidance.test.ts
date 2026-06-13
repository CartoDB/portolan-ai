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
