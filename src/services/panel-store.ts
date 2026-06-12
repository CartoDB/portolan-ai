/**
 * Panel Store - lightweight registry of active dashboard panels.
 *
 * DashboardCanvas writes panel info here on every render.
 * The explore page reads it for @-mentionable resource listings.
 * Not reactive (no useSyncExternalStore) since resource listing is on-demand.
 */

import { getQueryResult } from "@/services/query-store";

export interface PanelEntry {
  id: string;
  componentName: string;
  title: string;
  queryId?: string;
}

let activePanels: PanelEntry[] = [];

/** Called by DashboardCanvas whenever panels change. */
export function syncActivePanels(panels: PanelEntry[]): void {
  activePanels = panels;
}

/** Read current panels (non-reactive, for resource listing). */
export function getActivePanels(): PanelEntry[] {
  return activePanels;
}

/** Look up a single panel by id (non-reactive). */
export function getPanelById(id: string): PanelEntry | undefined {
  return activePanels.find((p) => p.id === id);
}

/**
 * Build a JSON-serializable snapshot of a panel: metadata plus a summary of its
 * query result (row count, columns, sample rows). Shared by the panel resource
 * fetcher and the @panel mention context attachment.
 */
export function buildPanelSnapshot(panel: PanelEntry): Record<string, unknown> {
  const info: Record<string, unknown> = {
    panelId: panel.id,
    componentName: panel.componentName,
    title: panel.title,
  };
  if (panel.queryId) {
    info.queryId = panel.queryId;
    const result = getQueryResult(panel.queryId);
    if (result) {
      info.rowCount = result.rows.length;
      info.columns = result.rows[0] ? Object.keys(result.rows[0]) : [];
      info.sampleRows = result.rows.slice(0, 3);
    }
  }
  return info;
}
