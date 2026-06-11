/**
 * Tambo configuration aggregator - single entry point for all pages.
 * Import from "@/lib/tambo" resolves here.
 */

import { components } from "./components";
import { buildTools, tools } from "./tools";

export { buildCatalogContextString, buildContextHelpers } from "./context";
export { buildInitialSuggestions } from "./suggestions";
export { buildTools, components, tools };

/**
 * Base props shared by all TamboProvider instances across pages.
 *
 * Note: `tools` is intentionally NOT included here. Each focused route owns one
 * catalog and passes `buildTools(slug)` to the provider so the model only sees
 * that catalog's tools. Pages spread this config and add `tools` plus the
 * per-catalog `contextHelpers` themselves.
 */
export const tamboProviderConfig = {
  apiKey: import.meta.env.VITE_TAMBO_API_KEY as string,
  components,
  tamboUrl: import.meta.env.VITE_TAMBO_URL,
  autoGenerateThreadName: true,
  autoGenerateNameThreshold: 2,
} as const;
