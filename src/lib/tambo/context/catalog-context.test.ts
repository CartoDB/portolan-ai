import { describe, expect, it } from "vitest";
import type { Dataset } from "../../../services/catalogs/types";
import { buildCatalogContext } from "./catalog-context";

const ds: Dataset = {
  id: "zonas_peatonales",
  title: "Pedestrian zones",
  describes: "Pedestrian-only streets",
  answers: ["Q5"],
  crs: "EPSG:25830",
  nFeatures: 1234,
  status: "materialized",
  materialized: true,
  asset: "https://x/zonas_peatonales/zonas_peatonales.parquet",
  tiles: null,
  hasTiles: false,
  authority: "cache",
  sourceOfficialUrl: "https://sigma.madrid.es",
  geometryTypes: ["MultiPolygon"],
};

describe("buildCatalogContext", () => {
  it("includes the catalog base, dataset id, crs and answers", () => {
    const text = buildCatalogContext({ slug: "madrid", title: "Madrid", description: "", publicBase: "https://x" }, [
      ds,
    ]);
    expect(text).toContain("https://x");
    expect(text).toContain("zonas_peatonales");
    expect(text).toContain("EPSG:25830");
    expect(text).toContain("Q5");
  });

  it("marks non-materialized datasets as metadata only", () => {
    const text = buildCatalogContext({ slug: "madrid", title: "Madrid", description: "", publicBase: "https://x" }, [
      { ...ds, materialized: false, status: "source_unreachable" },
    ]);
    expect(text).toContain("metadata only");
  });
});
