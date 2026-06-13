/**
 * Pure LRU bookkeeping for DuckDB-WASM tables registered under queryIds.
 * `order` is oldest-first. Touching an id moves it to most-recent and returns
 * the ids that fall out of the cap so the caller can DROP those tables.
 */
export function touchLru(order: string[], id: string, cap: number): { next: string[]; evict: string[] } {
  const without = order.filter((existing) => existing !== id);
  const appended = [...without, id];
  const overflow = Math.max(0, appended.length - cap);
  return { next: appended.slice(overflow), evict: appended.slice(0, overflow) };
}
