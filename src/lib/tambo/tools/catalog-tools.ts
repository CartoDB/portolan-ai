import type { TamboTool } from "@tambo-ai/react";
import { z } from "zod";
import { describeDataset, loadCatalogIndex, resolveCatalog } from "../../../services/catalogs";

export function makeCatalogTools(slug: string): TamboTool[] {
  const catalog = resolveCatalog(slug);
  if (!catalog) throw new Error(`Unknown catalog ${slug}`);

  const listCatalogDatasets: TamboTool = {
    name: "listCatalogDatasets",
    description:
      "List the datasets in the active catalog with id, title, describes, crs, feature count, status and whether tiles exist.",
    tool: async () => {
      const datasets = await loadCatalogIndex(catalog.slug, catalog.publicBase);
      return datasets.map((d) => ({
        id: d.id,
        title: d.title,
        describes: d.describes,
        crs: d.crs,
        nFeatures: d.nFeatures,
        status: d.status,
        hasTiles: d.hasTiles,
        answers: d.answers,
      }));
    },
    inputSchema: z.object({}),
    outputSchema: z.array(
      z.object({
        id: z.string(),
        title: z.string(),
        describes: z.string(),
        crs: z.string(),
        nFeatures: z.number(),
        status: z.string(),
        hasTiles: z.boolean(),
        answers: z.array(z.string()),
      }),
    ),
  };

  const describeCatalogDataset: TamboTool = {
    name: "describeDataset",
    description: "Describe one dataset by id, returning its column names and types plus a sample SQL query.",
    tool: async ({ id }: { id: string }) => describeDataset(catalog.publicBase, id),
    inputSchema: z.object({ id: z.string() }),
    outputSchema: z.object({
      columns: z.array(z.object({ name: z.string(), type: z.string() })),
      sampleSql: z.string(),
    }),
  };

  return [listCatalogDatasets, describeCatalogDataset];
}
