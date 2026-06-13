/**
 * GeoMap component registration - the primary map visualization.
 * GeoMap description is the longest - own file for independent tuning.
 */

import type { TamboComponent } from "@tambo-ai/react";
import { geoMapSchema, InteractableGeoMap } from "@/components/tambo/geo-map";

export const geoMapComponent: TamboComponent = {
  name: "GeoMap",
  description:
    "deck.gl map supporting multiple geometry types. INTERACTABLE: AI can update props at runtime. " +
    "Pass `queryId` from runSQL, zero token cost. Auto-detects layer type from column names, or set layerType explicitly. " +
    "SQL patterns per type: " +
    "H3: SELECT h3_h3_to_string(h3_index) AS hex, <metric> AS value ... (deck.gl renders hexagons from hex string); " +
    "A5: use 'pentagon' column (see DuckDB notes for A5 SQL patterns); " +
    "Points: SELECT lat, lng, <metric> AS value ... ; " +
    "Native geometry: SELECT * from Parquet with GEOMETRY, auto-renders (see DuckDB notes). " +
    "GeoJSON: SELECT ST_AsGeoJSON(geometry) AS geometry, <metric> AS value ... (LAST RESORT, prefer native geometry); " +
    "Arcs: SELECT source_lat, source_lng, dest_lat, dest_lng, <metric> AS value ... ; " +
    "MULTI-LAYER: set `layers` array (max 5). Each layer has id, queryId, layerType, column mappings, colorScheme, opacity, visible. " +
    "Layer management (add/remove/toggle) uses update_component_props ONLY when the user selected this map via the Edit pencil button (isSelected=true). " +
    "Otherwise, create a new GeoMap with the desired layers. " +
    "Props: layerType, latitude/longitude/zoom (view), pitch (0-85, camera tilt), bearing (-180 to 180, rotation), colorMetric (legend), colorScheme, extruded (3D), basemap ('auto' always, never override), layers (multi-layer). " +
    "CINEMATIC VIEWS: pitch=45-60 + bearing=-15 to -30 for dramatic 3D city perspectives. Combine with extruded=true for immersive building/population views. " +
    "colorScheme: sequential 'viridis' | 'plasma' | 'inferno' | 'magma' | 'cividis' | 'warm' | 'cool' for magnitude (low to high), diverging 'blue-red' | 'spectral' for above/below a midpoint, 'turbo' for high-contrast rainbow. Prefer viridis for general magnitude, cividis when colorblind-safe matters. " +
    "Use extruded=true for 3D when showing building height or population density, it reveals magnitude intuitively.",
  component: InteractableGeoMap,
  propsSchema: geoMapSchema,
};
