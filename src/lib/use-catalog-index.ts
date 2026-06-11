import { useEffect, useState } from "react";
import type { CatalogRef } from "@/config/catalogs";
import { loadCatalogIndex } from "@/services/catalogs";
import type { Dataset } from "@/services/catalogs/types";

interface CatalogIndexState {
  datasets: Dataset[];
  loading: boolean;
  error: string | null;
}

/**
 * Loads the dataset index for a focused catalog, with loading and error states.
 * Re-loads when the catalog slug changes. On error the page stays usable, the
 * caller renders an error card while keeping the rest of the UI.
 */
export function useCatalogIndex(catalog: CatalogRef | undefined): CatalogIndexState {
  const [datasets, setDatasets] = useState<Dataset[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!catalog) {
      setDatasets([]);
      setLoading(false);
      setError(null);
      return;
    }

    let cancelled = false;
    setLoading(true);
    setError(null);

    loadCatalogIndex(catalog.slug, catalog.publicBase)
      .then((rows) => {
        if (cancelled) return;
        setDatasets(rows);
      })
      .catch((err: unknown) => {
        if (cancelled) return;
        setDatasets([]);
        setError(err instanceof Error ? err.message : String(err));
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });

    return () => {
      cancelled = true;
    };
  }, [catalog]);

  return { datasets, loading, error };
}
