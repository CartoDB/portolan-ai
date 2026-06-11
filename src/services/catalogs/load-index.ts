import { queryRows } from "../duckdb-wasm";
import { parseIndexRow } from "./parse-index";
import { datasetsIndexUrl } from "./read-surfaces";
import type { Dataset, RawIndexRow } from "./types";

const cache = new Map<string, Dataset[]>();

export async function loadCatalogIndex(slug: string, publicBase: string): Promise<Dataset[]> {
  const cached = cache.get(slug);
  if (cached) return cached;

  const url = datasetsIndexUrl(publicBase);
  // Core columns are present in every catalog's datasets index. The remaining
  // columns are optional and absent from some catalogs (e.g. Finland and South
  // Africa ship no `authority`/`source_official_url`, South Africa also no
  // `tiles`/`asset`). Selecting them by name would raise a DuckDB Binder Error
  // and break the whole index load, so match the optional set with COLUMNS(),
  // which silently includes only the columns that actually exist. parseIndexRow
  // already treats every optional field as nullable.
  const sql = `
    SELECT id, title, describes, answers, crs, n_features, status,
           COLUMNS('^(asset|tiles|authority|source_official_url|geometry_types)$')
    FROM read_parquet('${url}')
    ORDER BY status = 'materialized' DESC, n_features DESC`;
  const rows = await queryRows(sql);
  const datasets = rows.map((r) => parseIndexRow(r as unknown as RawIndexRow));
  cache.set(slug, datasets);
  return datasets;
}
