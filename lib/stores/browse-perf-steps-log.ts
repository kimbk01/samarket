/** GET /api/stores/browse - [browse-perf-steps] detail log (keeps [route-perf]) */
export type BrowsePerfStepsLog = {
  cache_key: string;
  cache_hit: 0 | 1;
  auth_required: boolean;
  auth_ms: number;
  taxonomy_cache_hit: boolean;
  db_base_ms: number;
  db_related_ms: number;
  db_total_ms: number;
  transform_ms: number;
  total_ms: number;
  result_count: number;
};

export function logBrowsePerfSteps(input: BrowsePerfStepsLog): void {
  console.log("[browse-perf-steps]", input);
}
