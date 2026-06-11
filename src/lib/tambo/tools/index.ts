/**
 * Tool registry - aggregates all tool registrations.
 * To add a new tool: create a file in this directory, import and add here.
 */

import type { TamboTool } from "@tambo-ai/react";
import { makeCatalogTools } from "./catalog-tools";
import { dismissPanelsTool } from "./dashboard";
import { exportCSVTool } from "./export";
import { makeIcebergTool } from "./iceberg";
import { makeQuestionTool } from "./question";
import { runSQLTool } from "./run-sql";

export const tools: TamboTool[] = [runSQLTool, dismissPanelsTool, exportCSVTool];

export function buildTools(slug: string): TamboTool[] {
  return [
    runSQLTool,
    dismissPanelsTool,
    exportCSVTool,
    ...makeCatalogTools(slug),
    makeIcebergTool(slug),
    makeQuestionTool(slug),
  ];
}
