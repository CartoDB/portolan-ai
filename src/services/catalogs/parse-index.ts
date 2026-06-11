import type { Dataset, RawIndexRow } from "./types";

function toStringArray(value: unknown): string[] {
  if (Array.isArray(value)) return value.map(String);
  if (value == null) return [];
  return [String(value)];
}

export function parseIndexRow(row: RawIndexRow): Dataset {
  const status = row.status ?? "unknown";
  return {
    id: row.id,
    title: row.title ?? row.id,
    describes: row.describes ?? "",
    answers: toStringArray(row.answers),
    crs: row.crs ?? "EPSG:4326",
    nFeatures: Number(row.n_features ?? 0),
    status,
    materialized: status === "materialized",
    asset: row.asset ?? null,
    tiles: row.tiles ?? null,
    hasTiles: Boolean(row.tiles),
    authority: row.authority ?? null,
    sourceOfficialUrl: row.source_official_url ?? null,
    geometryTypes: toStringArray(row.geometry_types),
  };
}
