import type { CatalogRef } from "../../../config/catalogs";
import type { Dataset } from "../../../services/catalogs/types";

export function buildCatalogContext(catalog: CatalogRef, datasets: Dataset[]): string {
  const lines: string[] = [];
  lines.push(`Active catalog ${catalog.title} at ${catalog.publicBase}.`);
  lines.push(
    `Read the GeoParquet at <base>/<id>/<id>.parquet or attach Iceberg with ` +
      `ATTACH 'cat' (TYPE iceberg, ENDPOINT '<base>', AUTHORIZATION_TYPE 'none'). Reproject native ` +
      `CRS to EPSG:4326 for display only with always_xy := true.`,
  );
  lines.push("Datasets:");
  for (const d of datasets) {
    if (!d.materialized) {
      lines.push(`- ${d.id}, ${d.title}, status ${d.status}, metadata only.`);
      continue;
    }
    lines.push(
      `- ${d.id}, ${d.title}. ${d.describes} CRS ${d.crs}, ${d.nFeatures} features, ` +
        `geometry ${d.geometryTypes.join("/") || "none"}, answers ${d.answers.join(", ") || "none"}` +
        `${d.hasTiles ? ", has PMTiles" : ""}.`,
    );
  }
  return lines.join("\n");
}
