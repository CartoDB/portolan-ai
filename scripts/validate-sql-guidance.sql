-- scripts/validate-sql-guidance.sql
-- Validate the SQL lessons against the DuckDB v1.5 engine (CLI mirrors the WASM build).
-- Run: duckdb < scripts/validate-sql-guidance.sql
INSTALL spatial; LOAD spatial;

-- Lesson: polygon-to-polygon distance is 0 on overlap; a representative point is honest.
-- muni is the 0..10 square (representative point ~ 5,5); water overlaps only the top-right corner.
WITH a AS (SELECT ST_GeomFromText('POLYGON((0 0, 0 10, 10 10, 10 0, 0 0))') AS muni),
     b AS (SELECT ST_GeomFromText('POLYGON((9 9, 9 12, 12 12, 12 9, 9 9))') AS water)
SELECT
  ST_Distance(a.muni, b.water)                              AS polygon_to_polygon,   -- expect 0.0
  round(ST_Distance(ST_PointOnSurface(a.muni), b.water), 3) AS point_on_surface      -- expect ~5.657
FROM a, b;

-- Lesson: materialize once, re-aggregate cheaply by name (mirrors registering qr_N).
CREATE TABLE qr_demo AS
  SELECT * FROM (VALUES ('lake', 0.2), ('river', 0.8), ('lake', 0.5), ('sea', 0.6)) AS t(nearest_type, km);
SELECT nearest_type, count(*) AS municipalities, round(avg(km), 2) AS avg_km
FROM qr_demo GROUP BY ALL ORDER BY municipalities DESC;
