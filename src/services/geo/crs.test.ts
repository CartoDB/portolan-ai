import { describe, expect, it } from "vitest";
import { transform4326Expr } from "./crs";

describe("transform4326Expr", () => {
  it("reprojects a native crs geometry to 4326 with xy order", () => {
    expect(transform4326Expr("geom", "EPSG:25830")).toBe(
      "ST_Transform(geom, 'EPSG:25830', 'EPSG:4326', always_xy := true)",
    );
  });
  it("passes through when already 4326", () => {
    expect(transform4326Expr("geom", "EPSG:4326")).toBe("geom");
  });
  it("treats a missing crs as 4326 passthrough", () => {
    expect(transform4326Expr("geom", undefined)).toBe("geom");
  });
});
