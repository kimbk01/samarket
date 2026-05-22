/** [dibay-cart-flow-v2] — 장바구니 shell·deferred checkout 체감 계측 (prod: `NEXT_PUBLIC_DIBAY_CART_FLOW_V2=1`) */

export type DibayCartFlowV2Payload = {
  slug: string;
  cart_shell_visible_ms?: number | null;
  cart_items_apply_ms?: number | null;
  checkout_contact_fetch_ms?: number | null;
  addresses_fetch_ms?: number | null;
  ride_time_fetch_ms?: number | null;
  store_summary_fetch_ms?: number | null;
  deferred_ready_ms?: number | null;
  first_interactive_ms?: number | null;
  cache_hit?: 0 | 1;
  singleflight_hit?: 0 | 1;
  query_count?: number | null;
  worst_stage?: string | null;
  worst_stage_ms?: number | null;
};

function flowV2Enabled(): boolean {
  if (typeof process !== "undefined" && process.env.NODE_ENV !== "production") return true;
  return process.env.NEXT_PUBLIC_DIBAY_CART_FLOW_V2 === "1";
}

export function dibayCartFlowV2Log(payload: DibayCartFlowV2Payload): void {
  if (!flowV2Enabled()) return;
  // eslint-disable-next-line no-console -- perf contract
  console.log("[dibay-cart-flow-v2]", payload);
}

export function dibayCartFlowWorstStage(stages: Record<string, number | null | undefined>): {
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
