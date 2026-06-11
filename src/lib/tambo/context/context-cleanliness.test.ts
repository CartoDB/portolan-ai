import { describe, expect, it } from "vitest";
import type { CatalogRef } from "../../../config/catalogs";
import type { Dataset } from "../../../services/catalogs/types";
import { buildContextHelpers } from "./index";

const catalog: CatalogRef = {
  slug: "madrid",
  title: "Madrid",
  description: "",
  publicBase: "https://example.com/madrid",
};

const datasets: Dataset[] = [
  {
    id: "zonas_peatonales",
    title: "Pedestrian zones",
    describes: "Pedestrian-only streets",
    answers: ["Q5"],
    crs: "EPSG:25830",
    nFeatures: 1234,
    status: "materialized",
    materialized: true,
    asset: "https://example.com/madrid/zonas_peatonales/zonas_peatonales.parquet",
    tiles: null,
    hasTiles: false,
    authority: "cache",
    sourceOfficialUrl: "https://sigma.madrid.es",
    geometryTypes: ["MultiPolygon"],
  },
];

/** Assemble the full text the AI receives, the same way the app does. */
function assembleContext(): string {
  const helpers = buildContextHelpers(null, catalog, datasets);
  return Object.values(helpers)
    .map((thunk) => {
      const value = (thunk as () => unknown)();
      return typeof value === "string" ? value : JSON.stringify(value);
    })
    .join("\n");
}

describe("AI context cleanliness", () => {
  const text = assembleContext();
  const lower = text.toLowerCase();

  const forbidden = [
    "getcrossindex",
    "buildparqueturl",
    "suggestanalysis",
    "explorearcgisservice",
    "describearcgislayer",
    "listdatasets",
    "overture",
    "weather",
    "cross-index",
    "h3_",
    "a5 cells",
    "a5 sql",
    "grid resolution",
  ];

  for (const needle of forbidden) {
    it(`does not leak '${needle}' into the AI context`, () => {
      expect(lower).not.toContain(needle);
    });
  }

  it("includes the ST_Transform reprojection guidance", () => {
    expect(text).toContain("ST_Transform");
  });

  it("includes the correct ENDPOINT ATTACH form", () => {
    expect(text).toContain("ATTACH 'cat' (TYPE iceberg, ENDPOINT");
  });

  it("documents surviving generative-UI components and the queryId pattern", () => {
    expect(text).toContain("queryId");
    expect(text).toContain("GeoMap");
    expect(text).toContain("DataTable");
    expect(text).toContain("TimeSlider");
  });
});
