import { CATALOGS, type CatalogRef, getCatalog } from "../../config/catalogs";

export function listCatalogs(): CatalogRef[] {
  return CATALOGS;
}

export function resolveCatalog(slug: string): CatalogRef | undefined {
  return getCatalog(slug);
}
