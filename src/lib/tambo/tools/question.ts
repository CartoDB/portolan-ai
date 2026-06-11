import type { TamboTool } from "@tambo-ai/react";
import { z } from "zod";
import { loadCatalogIndex, resolveCatalog } from "../../../services/catalogs";

export function makeQuestionTool(slug: string): TamboTool {
  const catalog = resolveCatalog(slug);
  if (!catalog) throw new Error(`Unknown catalog ${slug}`);

  return {
    name: "findDatasetsForQuestion",
    description:
      "Given a client question-bank id such as Q5, return the datasets in this catalog whose answers include it.",
    tool: async ({ questionId }: { questionId: string }) => {
      const datasets = await loadCatalogIndex(catalog.slug, catalog.publicBase);
      return datasets
        .filter((d) => d.answers.includes(questionId))
        .map((d) => ({ id: d.id, title: d.title, describes: d.describes }));
    },
    inputSchema: z.object({ questionId: z.string() }),
    outputSchema: z.array(z.object({ id: z.string(), title: z.string(), describes: z.string() })),
  };
}
