export interface CatalogRef {
  slug: string;
  title: string;
  description: string;
  publicBase: string;
}

const BUCKET = "https://storage.googleapis.com/carto-portolan-cats";

export const CATALOGS: CatalogRef[] = [
  {
    slug: "madrid",
    title: "Madrid",
    description: "SIGMA urban planning, housing and mobility layers, EPSG:25830.",
    publicBase: `${BUCKET}/madrid`,
  },
  {
    slug: "finland",
    title: "Finland",
    description: "Statistics Finland areas and NLS maastotiedot topographic layers.",
    publicBase: `${BUCKET}/finland`,
  },
  {
    slug: "south-africa",
    title: "South Africa",
    description: "DLRRD cadastre, administrative, agriculture and hydrology layers.",
    publicBase: `${BUCKET}/south-africa`,
  },
];

export function getCatalog(slug: string): CatalogRef | undefined {
  return CATALOGS.find((c) => c.slug === slug);
}
