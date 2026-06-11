const WGS84 = "EPSG:4326";

export function transform4326Expr(geomExpr: string, nativeCrs?: string): string {
  if (!nativeCrs || nativeCrs === WGS84) return geomExpr;
  return `ST_Transform(${geomExpr}, '${nativeCrs}', '${WGS84}', always_xy := true)`;
}
