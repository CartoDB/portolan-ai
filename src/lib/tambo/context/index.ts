/**
 * Context helpers assembler - combines all context pieces into a single object for TamboProvider.
 * This file wires the pieces together. Edit individual files for specific concerns.
 */

import type { CatalogRef } from "@/config/catalogs";
import { getSettings } from "@/lib/settings-store";
import type { GeoIP } from "@/lib/use-geo-ip";
import type { Dataset } from "@/services/catalogs/types";
import { behaviorRules } from "./behavior";
import { buildCatalogContext } from "./catalog-context";
import { buildComponentTips } from "./component-tips";
import { buildDuckdbWasmNotes } from "./duckdb-notes";

/** Returns the current UI theme: "dark" or "light". */
function getCurrentTheme(): "dark" | "light" {
  if (typeof document === "undefined") return "dark";
  return document.documentElement.classList.contains("dark") ? "dark" : "light";
}

/** Build user environment context (theme, location, date). */
function buildUserEnvironment(geo: GeoIP | null) {
  const theme = getCurrentTheme();
  const timezone = geo?.timezone || Intl.DateTimeFormat().resolvedOptions().timeZone;
  const currentDate = new Date().toLocaleDateString("en-CA", { timeZone: geo?.timezone || undefined });

  return {
    currentDate,
    userTimezone: timezone,
    dateNote:
      "currentDate is the user's local date in YYYY-MM-DD (ISO 8601). DuckDB casts directly. " +
      "Use it for date filtering.",
    theme,
    basemapHint:
      "ALWAYS set basemap='auto'. It automatically matches the user's theme (" +
      theme +
      "). NEVER set basemap='dark' or 'light' unless the user explicitly asks to override. " +
      "Do NOT read the theme value and manually pick dark/light. That causes reversal bugs. Just use 'auto'.",
    ...(geo ? buildLocationContext(geo, timezone, currentDate) : {}),
  };
}

/** Build geo-IP location context when available. */
function buildLocationContext(geo: GeoIP, timezone: string, currentDate: string) {
  return {
    userLocation: {
      city: geo.city,
      country: geo.country,
      countryCode: geo.country_code,
      lat: geo.latitude,
      lng: geo.longitude,
      region: geo.region,
      timezone: geo.timezone,
    },
    locationHint:
      "The user is browsing from " +
      geo.city +
      ", " +
      geo.country +
      " (latitude=" +
      geo.latitude +
      " [north/south], longitude=" +
      geo.longitude +
      " [east/west]). " +
      "Timezone: " +
      timezone +
      ". Local date: " +
      currentDate +
      ". " +
      "Coordinate order: see DuckDB notes. " +
      "Use this to personalize initial suggestions (for example show data for their city or region first). " +
      "Do NOT mention that you know their location unless they ask about their area.",
  };
}

/**
 * Build contextHelpers for TamboProvider.
 * Assembles user environment, behavior rules, DuckDB notes, dataset paths, and component tips.
 */
/**
 * Build the combined per-catalog context string for the focused route.
 * Combines the active catalog and its datasets, the behavior rules, and the
 * DuckDB notes into a single string the Tambo provider can send as context.
 */
export function buildCatalogContextString(catalog: CatalogRef, datasets: Dataset[]): string {
  const { queryLimit } = getSettings();
  return [
    buildCatalogContext(catalog, datasets),
    "",
    "Behavior:",
    ...behaviorRules,
    "",
    "DuckDB notes:",
    ...buildDuckdbWasmNotes(queryLimit),
    "",
    "Component tips:",
    ...buildComponentTips(),
  ].join("\n");
}

export function buildContextHelpers(geo: GeoIP | null, catalog?: CatalogRef, datasets?: Dataset[]) {
  return {
    // Catalog-scoped context for the focused route: the active catalog and its
    // datasets, the behavior rules, the DuckDB notes, and the component tips,
    // assembled into a single string for the provider. The user environment
    // (theme, location, date) rounds it out.
    userEnvironment: () => buildUserEnvironment(geo),
    ...(catalog
      ? {
          catalogContext: () => buildCatalogContextString(catalog, datasets ?? []),
        }
      : {}),
  };
}
