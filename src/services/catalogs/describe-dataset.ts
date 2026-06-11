import { queryRows } from "../duckdb-wasm";
import { geoparquetUrl } from "./read-surfaces";

export interface ColumnInfo {
  name: string;
  type: string;
}

export async function describeDataset(
  publicBase: string,
  id: string,
): Promise<{ columns: ColumnInfo[]; sampleSql: string }> {
  const url = geoparquetUrl(publicBase, id);
  const rows = await queryRows(`DESCRIBE SELECT * FROM read_parquet('${url}')`);
  const columns = rows.map((r) => ({
    name: String((r as Record<string, unknown>).column_name),
    type: String((r as Record<string, unknown>).column_type),
  }));
  const sampleSql = `SELECT * FROM read_parquet('${url}') LIMIT 100`;
  return { columns, sampleSql };
}
