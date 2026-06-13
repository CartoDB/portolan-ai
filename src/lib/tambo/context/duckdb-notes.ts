/**
 * DuckDB v1.5 WASM technical rules - sent as AI context.
 * Edit this file when DuckDB version changes or new rules are discovered.
 * queryLimit is read from settings store at message-send time.
 */

export function buildDuckdbWasmNotes(queryLimit: number): string[] {
  return [
    `DuckDB v1.5 WASM. The httpfs, spatial and iceberg extensions are loaded. Write ONE statement. Use a LIMIT of ${queryLimit}. Read remote files over HTTPS URLs in FROM.`,
    "Never guess, abbreviate or truncate a column name. Before you name specific columns, call the describeDataset tool for that dataset id, or run DESCRIBE SELECT * FROM read_parquet('<base>/<id>/<id>.parquet') first, and copy the exact names from the result. Column names such as USP_TX_DENOM are exact and case sensitive. When you only need a map or a quick preview, prefer SELECT * with a LIMIT so geometry auto-renders, rather than hand-picking columns you have not verified.",
    "Keep each query to a single straightforward SELECT. Avoid LATERAL joins, UNNEST and ST_Dump, the WASM build rejects a LATERAL join whose condition is not a plain comparison. To explode multipart geometry prefer a simple function over a lateral expansion, and when in doubt return the geometry column as is so it renders directly.",
    "Each Portolan catalog publishes a static Iceberg v3 surface plus GeoParquet. Attach the catalog with ATTACH 'cat' (TYPE iceberg, ENDPOINT '<base>', AUTHORIZATION_TYPE 'none') where <base> is the catalog public base URL. Then query cat.catalog.datasets for the dataset index and cat.v3.<id> for a single dataset.",
    "Read one dataset either with read_parquet('<base>/<id>/<id>.parquet') or as cat.v3.<id>. The Iceberg table references the already-published GeoParquet by absolute URI, so both read the same bytes.",
    "Datasets are vector features stored in their native CRS. Each dataset's native CRS is listed in the catalog context above, use that exact CRS value (for example EPSG:25830) as the source CRS in ST_Transform. Keep the native CRS for joins, filters, attribute math and counts. Reproject to EPSG:4326 for map display only with ST_Transform(geom, 'EPSG:25830', 'EPSG:4326', always_xy := true) so features land in the correct location. This reprojection is required for map display only, do not reproject when you only compute attributes or counts.",
    "Row group pruning over HTTP works only on the flat xmin, ymin, xmax, ymax bbox columns, never on the geometry column. To filter a viewport, put a predicate on those four bbox columns so DuckDB can skip row groups.",
    "Geometry: a SELECT that returns a GEOMETRY column auto-renders on the map. WASM cannot serialize GEOMETRY to Arrow directly, the system converts it to WKB for you, so just SELECT the geometry column. The discovery index cat.catalog.datasets carries id, title, describes, answers, crs, n_features, status, asset, tiles, authority and source_official_url, so discover datasets through it rather than guessing names.",
    "Reuse results, do not recompute. Every runSQL returns a queryId such as qr_5, and that queryId is also a real table you can read. To re-sort, re-aggregate, bin or summarize a result you already computed, write FROM qr_5 instead of pasting the expensive query again. The table holds the result columns, including the auto-generated lat and lng, and __geo_wkb when geometry was detected (re-render with ST_GeomFromWKB(__geo_wkb) AS geom).",
    "Compute once, derive many. For a question that needs several views, build the heavy metric query one time, take its queryId, then derive every ranking, chart and summary from that queryId. Do not rebuild the metric for each panel.",
    "Distance from an area. To measure distance from a polygon dataset such as municipalities or parcels to features such as lakes or roads, measure from a representative point with ST_PointOnSurface(geom), for example ST_Distance(ST_PointOnSurface(k.geom), w.geom). Polygon-to-polygon distance is 0 wherever the shapes overlap, which silently turns every row into 0. Keep the bbox prefilter on the flat xmin, ymin, xmax, ymax columns so DuckDB still prunes row groups.",
  ];
}
