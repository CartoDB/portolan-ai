export interface Bounds {
  minx: number;
  miny: number;
  maxx: number;
  maxy: number;
}

export function bboxPrunePredicate(bounds: Bounds | null): string {
  if (!bounds) return "TRUE";
  const { minx, miny, maxx, maxy } = bounds;
  return `xmax >= ${minx} AND xmin <= ${maxx} AND ymax >= ${miny} AND ymin <= ${maxy}`;
}
