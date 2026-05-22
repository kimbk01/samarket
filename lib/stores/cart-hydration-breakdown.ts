/**
 * Cart page client hydration breakdown — prod: `NEXT_PUBLIC_DIBAY_CART_FLOW_V2=1`
 * Playwright `measure-cart-page-phases` uses `[data-samarket-cart-hydrated="1"]` (real shell ready).
 */

export type CartHydrationBreakdownPayload = {
  mount_start_ms: number;
  first_render_ms: number | null;
  provider_ready_ms: number | null;
  cart_state_ready_ms: number | null;
  totals_ready_ms: number | null;
  checkout_deferred_scheduled_ms: number | null;
  addresses_deferred_scheduled_ms: number | null;
  first_button_interactive_ms: number | null;
  hydrated_marker_set_ms: number | null;
  expensive_effects_ms: number | null;
  render_count: number;
  rerender_count: number;
  worst_stage: string;
  worst_stage_ms: number;
};

type StageKey = keyof Omit<
  CartHydrationBreakdownPayload,
  "render_count" | "rerender_count" | "worst_stage" | "worst_stage_ms"
>;

const PAGE_T0 =
  typeof performance !== "undefined" ? performance.now() : 0;

let pageMountT0 = PAGE_T0;
let finalized = false;
let renderCount = 0;
let rerenderCount = 0;
let expensiveEffectsDoneMs: number | null = null;

const stages: Partial<Record<StageKey, number>> = {
  mount_start_ms: 0,
};

function breakdownEnabled(): boolean {
  if (typeof process !== "undefined" && process.env.NODE_ENV !== "production") return true;
  return process.env.NEXT_PUBLIC_DIBAY_CART_FLOW_V2 === "1";
}

export function resetCartHydrationBreakdownForTests(): void {
  pageMountT0 = typeof performance !== "undefined" ? performance.now() : 0;
  finalized = false;
  renderCount = 0;
  rerenderCount = 0;
  expensiveEffectsDoneMs = null;
  for (const k of Object.keys(stages) as StageKey[]) {
    delete stages[k];
  }
  stages.mount_start_ms = 0;
}

/** Cart route client mount — call once from entry or page client */
export function markCartHydrationPageMount(): number {
  pageMountT0 = performance.now();
  stages.mount_start_ms = 0;
  return pageMountT0;
}

export function markCartHydrationStage(stage: StageKey): void {
  if (finalized || !breakdownEnabled()) return;
  if (stages[stage] != null) return;
  stages[stage] = Math.round(performance.now() - pageMountT0);
}

export function noteCartHydrationRender(isRerender: boolean): void {
  if (!breakdownEnabled()) return;
  renderCount += 1;
  if (isRerender) rerenderCount += 1;
}

export function markCartHydrationExpensiveEffectsDone(): void {
  if (!breakdownEnabled()) return;
  if (expensiveEffectsDoneMs != null) return;
  expensiveEffectsDoneMs = Math.round(performance.now() - pageMountT0);
}

function worstStage(): { worst_stage: string; worst_stage_ms: number } {
  let worst_stage = "none";
  let worst_stage_ms = 0;
  for (const [k, v] of Object.entries(stages)) {
    if (k === "mount_start_ms") continue;
    const ms = typeof v === "number" ? v : 0;
    if (ms > worst_stage_ms) {
      worst_stage_ms = ms;
      worst_stage = k;
    }
  }
  return { worst_stage, worst_stage_ms };
}

export function flushCartHydrationBreakdown(force = false): void {
  if (!breakdownEnabled() || (finalized && !force)) return;
  finalized = true;
  const payload: CartHydrationBreakdownPayload = {
    mount_start_ms: stages.mount_start_ms ?? 0,
    first_render_ms: stages.first_render_ms ?? null,
    provider_ready_ms: stages.provider_ready_ms ?? null,
    cart_state_ready_ms: stages.cart_state_ready_ms ?? null,
    totals_ready_ms: stages.totals_ready_ms ?? null,
    checkout_deferred_scheduled_ms: stages.checkout_deferred_scheduled_ms ?? null,
    addresses_deferred_scheduled_ms: stages.addresses_deferred_scheduled_ms ?? null,
    first_button_interactive_ms: stages.first_button_interactive_ms ?? null,
    hydrated_marker_set_ms: stages.hydrated_marker_set_ms ?? null,
    expensive_effects_ms: expensiveEffectsDoneMs,
    render_count: renderCount,
    rerender_count: rerenderCount,
    ...worstStage(),
  };
  // eslint-disable-next-line no-console -- perf contract
  console.log("[cart-hydration-breakdown]", payload);
  if (typeof window !== "undefined") {
    (window as Window & { __samarketCartHydrationBreakdown?: CartHydrationBreakdownPayload }).__samarketCartHydrationBreakdown =
      payload;
  }
}
