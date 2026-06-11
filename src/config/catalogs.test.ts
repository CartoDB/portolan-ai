import { describe, expect, it } from "vitest";
import { CATALOGS, getCatalog } from "./catalogs";

describe("catalog config", () => {
  it("has the three published catalogs", () => {
    expect(CATALOGS.map((c) => c.slug).sort()).toEqual(["finland", "madrid", "south-africa"]);
  });

  it("points each public base at the shared GCS bucket", () => {
    for (const c of CATALOGS) {
      expect(c.publicBase).toBe(`https://storage.googleapis.com/carto-portolan-cats/${c.slug}`);
    }
  });

  it("resolves a catalog by slug and returns undefined otherwise", () => {
    expect(getCatalog("madrid")?.title).toBeTruthy();
    expect(getCatalog("nope")).toBeUndefined();
  });
});
