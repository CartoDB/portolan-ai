import type { TamboTool } from "@tambo-ai/react";
import { z } from "zod";
import { icebergAttachSql, resolveCatalog } from "../../../services/catalogs";
import { queryRows } from "../../../services/duckdb-wasm";

export function makeIcebergTool(slug: string): TamboTool {
  const catalog = resolveCatalog(slug);
  if (!catalog) throw new Error(`Unknown catalog ${slug}`);

  return {
    name: "attachIcebergCatalog",
    description:
      "Attach the active catalog's static Iceberg v3 surface as alias cat, so you can query cat.catalog.datasets and cat.v3.<id>.",
    tool: async () => {
      await queryRows(icebergAttachSql(catalog.publicBase, "cat"));
      return { attached: true, alias: "cat" };
    },
    inputSchema: z.object({}),
    outputSchema: z.object({ attached: z.boolean(), alias: z.string() }),
  };
}
