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

export type BrowsePerfStepsV2Log = {
  request_key: string;
  cache_hit: 0 | 1;
  taxonomy_cache_hit: boolean;
  db_base_ms: number;
  db_related_ms: number;
  base_query_ms: number;
  category_query_ms: number;
  product_preview_query_ms: number;
  review_summary_query_ms: number;
  distance_sort_ms: number;
  transform_ms: number;
  query_count: number;
  result_count: number;
  selected_columns: string;
  worst_stage: string;
  worst_stage_ms: number;
};

function pickWorstStage(stages: Record<string, number>): { worst_stage: string; worst_stage_ms: number } {
  let worst_stage = "none";
  let worst_stage_ms = 0;
  for (const [name, ms] of Object.entries(stages)) {
    const rounded = Math.round(ms);
    if (rounded > worst_stage_ms) {
      worst_stage = name;
      worst_stage_ms = rounded;
    }
  }
  return { worst_stage, worst_stage_ms };
}

export function logBrowsePerfSteps(input: BrowsePerfStepsLog): void {
  console.log("[browse-perf-steps]", input);
}

export function logBrowsePerfStepsV2(input: BrowsePerfStepsV2Log): void {
  console.log("[browse-perf-steps-v2]", input);
}

export function resolveBrowsePerfWorstStage(
  stages: Record<string, number>
): { worst_stage: string; worst_stage_ms: number } {
  return pickWorstStage(stages);
}
