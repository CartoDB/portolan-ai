/**
 * Component usage tips for AI context - guides the LLM on how to render each
 * generative-UI component from a queryId.
 * Edit this file when adding new components or discovering better patterns.
 */

export function buildComponentTips(): string[] {
  return [
    // Data flow
    "ALL visualization components take a queryId from a runSQL result, never inline data arrays. Run the query once, then pass the returned queryId to every component that should render it. This keeps data out of the token stream.",

    // GeoMap
    "GeoMap: pass queryId. A SELECT that returns a GEOMETRY column auto-renders as map features. Set basemap='auto'. Reproject to EPSG:4326 for display as described in the DuckDB notes.",

    // Graph
    "Graph: queryId + xColumn + yColumns + chartType (bar/line/area/pie). " +
      "ALWAYS set xLabel and yLabel to explain the axes (for example xLabel='Rank', yLabel='Population'). " +
      "Use 'area' for filled line charts. The Y-axis auto-formats large numbers (for example 5000 renders as '5k'). " +
      "Build meaningful x-axis labels in SQL when the raw key is not human readable, for example ROW_NUMBER() for rank labels or CASE/WHEN to bucket numeric ranges.",

    // DataTable
    "DataTable: queryId only, it auto-derives columns and rows. Optional visibleColumns to limit which columns show.",

    // StatsCard and StatsGrid
    "StatsCard: a single headline metric from a queryId, with a label and optional unit. Use for one key number.",
    "StatsGrid: several metrics from a queryId rendered as a compact grid of cards. Use for a small set of related numbers.",

    // InsightCard
    "InsightCard: a short written takeaway tied to a queryId, for summarizing what the data shows in one or two sentences.",

    // DatasetCard
    "DatasetCard: renders a catalog dataset's metadata (id, title, description, CRS, feature count). Use it to surface a dataset when the user is exploring what is available.",

    // QueryDisplay
    "QueryDisplay: shows the SQL behind a queryId so the user can read or audit the query. Pair it with a visualization when the query itself is worth showing.",

    // TimeSlider
    "TimeSlider: queryId + timestampColumn (default 'time_label'). Pass a query that spans all timestamps. " +
      "It cross-filters a GeoMap to the snapshot at the selected time and marks a reference line on a linked Graph. " +
      "Reuse the same queryId across the GeoMap, Graph and DataTable so they stay linked.",
  ];
}
