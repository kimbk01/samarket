/** [dibay-store-detail-flow-v2] — 상세 shell·메뉴·API 체감 계측 (prod: `NEXT_PUBLIC_DIBAY_STORE_DETAIL_FLOW_V2=1`) */

export type DibayStoreDetailFlowV2Payload = {
  slug: string;
  shell_visible_ms?: number | null;
  summary_fetch_ms?: number | null;
  summary_apply_ms?: number | null;
  menus_fetch_ms?: number | null;
  menus_apply_ms?: number | null;
  banners_fetch_ms?: number | null;
  reviews_fetch_ms?: number | null;
  first_menu_card_visible_ms?: number | null;
  first_interactive_ms?: number | null;
  cache_hit?: 0 | 1;
  singleflight_hit?: 0 | 1;
  payload_kb?: number | null;
  query_count?: number | null;
  worst_stage?: string | null;
  worst_stage_ms?: number | null;
  fetch_path?: string;
};

function flowV2Enabled(): boolean {
  if (typeof process !== "undefined" && process.env.NODE_ENV !== "production") return true;
  return process.env.NEXT_PUBLIC_DIBAY_STORE_DETAIL_FLOW_V2 === "1";
}

export function dibayStoreDetailFlowV2Log(payload: DibayStoreDetailFlowV2Payload): void {
  if (!flowV2Enabled()) return;
  // eslint-disable-next-line no-console -- perf contract
  console.log("[dibay-store-detail-flow-v2]", payload);
}

export function dibayStoreDetailFlowPayloadKb(json: unknown): number | null {
  try {
    const bytes = new TextEncoder().encode(JSON.stringify(json)).length;
    return Math.round((bytes / 1024) * 10) / 10;
  } catch {
    return null;
  }
}

export function dibayStoreDetailFlowWorstStage(stages: Record<string, number | null | undefined>): {
  worst_stage: string;
  worst_stage_ms: number;
} {
  let worst_stage = "none";
  let worst_stage_ms = 0;
  for (const [k, v] of Object.entries(stages)) {
    const ms = typeof v === "number" && Number.isFinite(v) ? Math.round(v) : 0;
    if (ms > worst_stage_ms) {
      worst_stage_ms = ms;
      worst_stage = k;
    }
  }
  return { worst_stage, worst_stage_ms };
}
