/**
 * Catalog-driven suggestion chips - shown to users on first visit.
 *
 * Each Portolan catalog ships a question bank (the integer ids in every dataset's
 * `answers` column). The bank text below is authored from each catalog's published
 * dataset `describes`, the catalogs do not publish the question prose itself. At
 * runtime we filter the bank to the question ids that the live catalog index
 * actually has among its materialized datasets, so dropped or failed datasets do
 * not leave dead chips. Unknown catalogs fall back to chips derived from their
 * dataset titles.
 */

import type { Suggestion } from "@tambo-ai/react";
import type { CatalogRef } from "@/config/catalogs";
import type { GeoIP } from "@/lib/use-geo-ip";
import type { Dataset } from "@/services/catalogs/types";

interface CatalogQuestion {
  /** Question-bank id, matches the integers in a dataset's `answers` column. */
  id: string;
  /** Short chip label. */
  title: string;
  /** The prompt sent when the chip is clicked. */
  prompt: string;
}

/**
 * Per-catalog question banks. Keys are catalog slugs. Each entry's `id` matches a
 * question-bank integer present in the catalog's dataset `answers`. Authored to be
 * plain, clickable questions a non-expert can ask.
 */
const CATALOG_QUESTIONS: Record<string, CatalogQuestion[]> = {
  madrid: [
    {
      id: "1",
      title: "Land use & buildability",
      prompt: "What land use and buildability does the current plan allow for parcels in Madrid? Show it on the map.",
    },
    {
      id: "7",
      title: "70,000 homes target",
      prompt: "How far along are Madrid's southeast developments toward the 70,000 new-homes target?",
    },
    {
      id: "3",
      title: "Tourist flats",
      prompt: "Where are the registered tourist flats in Madrid, and how many are there by area?",
    },
    {
      id: "5",
      title: "Low-emission zone",
      prompt: "Where can vehicles drive under Madrid's low-emission zone, and where are the pedestrian zones?",
    },
    {
      id: "4",
      title: "Energy-rehab subsidies",
      prompt: "Which areas and buildings in Madrid qualify for energy-rehabilitation subsidies?",
    },
    {
      id: "6",
      title: "Acoustic protection",
      prompt: "Which parts of Madrid fall inside a Special Acoustic Protection Zone (ZPAE)?",
    },
    {
      id: "9",
      title: "Protected buildings",
      prompt: "Which buildings in Madrid are legally protected before a licence can be granted?",
    },
    {
      id: "2",
      title: "Licence suspensions",
      prompt: "Which plots in Madrid sit under a licence suspension or an aeronautical height easement?",
    },
    {
      id: "10",
      title: "Air quality near schools",
      prompt: "Where are the air-monitoring schools in Madrid relative to the low-emission zone?",
    },
  ],
  finland: [
    {
      id: "11",
      title: "Where people live",
      prompt: "Where does Finland's population concentrate on the 1 km grid?",
    },
    {
      id: "3",
      title: "Holiday cottages",
      prompt: "Where are Finland's holiday and leisure buildings concentrated?",
    },
    {
      id: "4",
      title: "Access to services",
      prompt: "How well can residents reach services along Finland's road network and population grid?",
    },
    {
      id: "8",
      title: "Socio-economic areas",
      prompt: "Which Finnish postal areas have the highest income, education and employment?",
    },
    {
      id: "6",
      title: "Wellbeing-county reform",
      prompt: "How did the 2023 wellbeing-services reform reshape Finland's service areas?",
    },
    {
      id: "2",
      title: "Near water",
      prompt: "Which areas of Finland sit closest to lakes, rivers and the sea?",
    },
    {
      id: "10",
      title: "Shoreline buildings",
      prompt: "Which Finnish municipalities have the most buildings along the shoreline?",
    },
    {
      id: "7",
      title: "Building stock",
      prompt: "How is Finland's building stock distributed across the country?",
    },
    {
      id: "9",
      title: "Agricultural land",
      prompt: "Where is agricultural land spread across Finland?",
    },
  ],
  "south-africa": [
    {
      id: "1",
      title: "State land for redistribution",
      prompt: "Where is unalienated state land suitable for redistribution in South Africa?",
    },
    {
      id: "2",
      title: "Restitution claims",
      prompt: "Which erven fall within a land-restitution claim in South Africa?",
    },
    {
      id: "3",
      title: "Agricultural potential",
      prompt: "What is the agricultural land capability of redistribution parcels in South Africa?",
    },
    {
      id: "10",
      title: "Land audit by province",
      prompt: "What does the land audit look like across South Africa's provinces?",
    },
  ],
};

/** Shorten a long dataset title for a chip label. */
function shortTitle(title: string): string {
  const cut = title.split("(")[0].trim();
  return cut.length > 32 ? `${cut.slice(0, 30).trim()}...` : cut;
}

/** Fallback for catalogs without an authored bank: one chip per materialized dataset. */
function suggestionsFromDatasets(catalog: CatalogRef, datasets: Dataset[]): Suggestion[] {
  return datasets
    .filter((d) => d.materialized)
    .slice(0, 8)
    .map((d) => ({
      id: `s-${catalog.slug}-${d.id}`,
      title: shortTitle(d.title),
      detailedSuggestion: `Show me ${d.title} in ${catalog.title} on the map.`,
      messageId: `s-${catalog.slug}-${d.id}`,
    }));
}

/** Generic chips when no catalog is in focus (the chat pages always have one, so this is a safety net). */
const GENERIC_SUGGESTIONS: Suggestion[] = [
  {
    id: "s-pick-catalog",
    title: "List the datasets",
    detailedSuggestion: "What datasets are available in this catalog? List them with a short description of each.",
    messageId: "s-pick-catalog",
  },
];

/**
 * Build initial suggestions for the focused catalog.
 *
 * Filters the catalog's authored question bank to the ids present among its
 * materialized datasets (so chips always map to answerable questions). Before the
 * index loads (`datasets` empty) it shows the full bank, then narrows once the
 * index arrives. Catalogs with no authored bank fall back to dataset-title chips.
 *
 * @param _geo kept for signature compatibility, catalog questions are place-specific so geo-IP is not used.
 */
export function buildInitialSuggestions(_geo: GeoIP | null, catalog?: CatalogRef, datasets?: Dataset[]): Suggestion[] {
  if (!catalog) return GENERIC_SUGGESTIONS;

  const bank = CATALOG_QUESTIONS[catalog.slug];
  if (!bank) return suggestionsFromDatasets(catalog, datasets ?? []);

  // Question ids the live catalog actually supports (materialized datasets only).
  const present = new Set<string>();
  for (const d of datasets ?? []) {
    if (d.materialized) for (const a of d.answers) present.add(a);
  }

  const usable = present.size > 0 ? bank.filter((q) => present.has(q.id)) : bank;
  const chosen = usable.length > 0 ? usable : bank;

  return chosen.map((q) => ({
    id: `s-${catalog.slug}-${q.id}`,
    title: q.title,
    detailedSuggestion: q.prompt,
    messageId: `s-${catalog.slug}-${q.id}`,
  }));
}
