export interface Dataset {
  id: string;
  title: string;
  describes: string;
  answers: string[];
  crs: string;
  nFeatures: number;
  status: string;
  materialized: boolean;
  asset: string | null;
  tiles: string | null;
  hasTiles: boolean;
  authority: string | null;
  sourceOfficialUrl: string | null;
  geometryTypes: string[];
}

export interface RawIndexRow {
  id: string;
  title?: string;
  describes?: string;
  answers?: unknown;
  crs?: string;
  n_features?: number | bigint;
  status?: string;
  asset?: string | null;
  tiles?: string | null;
  authority?: string | null;
  source_official_url?: string | null;
  geometry_types?: unknown;
}
