export function datasetsIndexUrl(publicBase: string): string {
  return `${publicBase}/catalog/datasets/datasets.parquet`;
}

export function geoparquetUrl(publicBase: string, id: string): string {
  return `${publicBase}/${id}/${id}.parquet`;
}

export function pmtilesUrl(publicBase: string, id: string): string {
  return `${publicBase}/${id}/${id}.pmtiles`;
}

export function icebergAttachSql(publicBase: string, alias = "cat"): string {
  return `ATTACH '${alias}' (TYPE iceberg, ENDPOINT '${publicBase}', AUTHORIZATION_TYPE 'none')`;
}

export function icebergScanSql(publicBase: string, id: string): string {
  return `iceberg_scan('${publicBase}/data/v3/${id}/metadata/v1.metadata.json')`;
}
