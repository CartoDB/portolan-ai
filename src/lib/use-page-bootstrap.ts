import { useEffect, useMemo } from "react";
import type { CatalogRef } from "@/config/catalogs";
import { buildContextHelpers, buildInitialSuggestions } from "@/lib/tambo";
import { useAnonymousUserKey } from "@/lib/use-anonymous-user-key";
import { useGeoIP } from "@/lib/use-geo-ip";
import type { Dataset } from "@/services/catalogs/types";
import { preloadDuckDB } from "@/services/duckdb-wasm";

/**
 * Shared bootstrap logic for page-level components.
 * Computes userKey, geo, contextHelpers, and suggestions.
 * Preloads DuckDB on mount.
 *
 * When the focused route resolves a catalog and loads its datasets, pass them in
 * so the contextHelpers carry the per-catalog context string for the provider.
 */
export function usePageBootstrap(catalog?: CatalogRef, datasets?: Dataset[]) {
  const userKey = useAnonymousUserKey();
  const geo = useGeoIP();
  const contextHelpers = useMemo(() => buildContextHelpers(geo, catalog, datasets), [geo, catalog, datasets]);
  const suggestions = useMemo(() => buildInitialSuggestions(geo), [geo]);

  useEffect(() => {
    preloadDuckDB();
  }, []);

  return { userKey, geo, contextHelpers, suggestions };
}
