import { describe, expect, it } from "vitest";
import { datasetsIndexUrl, geoparquetUrl, icebergAttachSql, icebergScanSql, pmtilesUrl } from "./read-surfaces";

const base = "https://storage.googleapis.com/carto-portolan-cats/madrid";

describe("read-surfaces", () => {
  it("builds the datasets index url", () => {
    expect(datasetsIndexUrl(base)).toBe(`${base}/catalog/datasets/datasets.parquet`);
  });
  it("builds a dataset geoparquet url", () => {
    expect(geoparquetUrl(base, "zonas_peatonales")).toBe(`${base}/zonas_peatonales/zonas_peatonales.parquet`);
  });
  it("builds a dataset pmtiles url", () => {
    expect(pmtilesUrl(base, "zonas_peatonales")).toBe(`${base}/zonas_peatonales/zonas_peatonales.pmtiles`);
  });
  it("builds an iceberg attach statement", () => {
    expect(icebergAttachSql(base, "cat")).toBe(
      `ATTACH 'cat' (TYPE iceberg, ENDPOINT '${base}', AUTHORIZATION_TYPE 'none')`,
    );
  });
  it("builds an iceberg scan path for a dataset", () => {
    expect(icebergScanSql(base, "zonas_peatonales")).toBe(
      `iceberg_scan('${base}/data/v3/zonas_peatonales/metadata/v1.metadata.json')`,
    );
  });
});
