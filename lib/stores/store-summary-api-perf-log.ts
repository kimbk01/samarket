/** GET /api/stores/[slug]/summary — 관측 전용 */

export type StoreSummaryApiPerfLog = {
  slug: string;
  total_ms: number;
  db_ms: number;
  cache_hit: 0 | 1;
  query_count: number;
};

export function logStoreSummaryApiPerf(input: StoreSummaryApiPerfLog): void {
  // eslint-disable-next-line no-console -- observability contract
  console.log("[store-summary-perf]", input);
}
