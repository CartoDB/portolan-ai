import { describe, expect, it } from "vitest";
import { parseIndexRow } from "./parse-index";

describe("parseIndexRow", () => {
  it("maps a raw index row into a typed dataset", () => {
    const ds = parseIndexRow({
      id: "zonas_peatonales",
      title: "Pedestrian zones",
      describes: "Pedestrian-only streets",
      answers: ["Q5"],
      crs: "EPSG:25830",
      n_features: 1234n,
      status: "materialized",
      asset: "https://x/zonas_peatonales/zonas_peatonales.parquet",
      tiles: "https://x/zonas_peatonales/zonas_peatonales.pmtiles",
      authority: "cache",
      source_official_url: "https://sigma.madrid.es",
      geometry_types: ["MultiPolygon"],
    });
    expect(ds.id).toBe("zonas_peatonales");
    expect(ds.nFeatures).toBe(1234);
    expect(ds.materialized).toBe(true);
    expect(ds.answers).toEqual(["Q5"]);
    expect(ds.hasTiles).toBe(true);
  });

  it("treats a non-materialized status as not queryable", () => {
    const ds = parseIndexRow({
      id: "x",
      title: "X",
      status: "source_unreachable",
      crs: "EPSG:4326",
      n_features: 0n,
      tiles: null,
    });
    expect(ds.materialized).toBe(false);
    expect(ds.hasTiles).toBe(false);
  });
});
