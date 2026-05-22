/** GET /api/stores/browse-featured-items — 관측 전용 */

export type BrowseFeaturedItemsPerfLog = {
  request_count: number;
  store_count: number;
  db_ms: number;
  transform_ms: number;
  cache_hit: 0 | 1;
  payload_bytes: number;
  query_count: number;
  worst_stage: string;
  worst_stage_ms: number;
};

export function logBrowseFeaturedItemsPerf(input: BrowseFeaturedItemsPerfLog): void {
  // eslint-disable-next-line no-console -- observability contract
  console.log("[browse-featured-items-perf]", input);
}

export type BrowseCardHydrationPerfLog = {
  visible_cards: number;
  hydrated_cards: number;
  skipped_cards: number;
  cache_hits: number;
};

export function logBrowseCardHydration(input: BrowseCardHydrationPerfLog): void {
  // eslint-disable-next-line no-console -- observability contract
  console.log("[browse-card-hydration]", input);
}
