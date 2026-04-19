"use client";

import { recordAppWidePhaseLastMs } from "@/lib/runtime/samarket-runtime-debug";

type TradeListPerfState = {
  recorded: Record<string, true>;
  productCardRenderCount: number;
};

const TRADE_LIST_PERF_STATE_KEY = "__samarketTradeListPerfState" as const;

function getTradeListPerfState(): TradeListPerfState {
  const g = globalThis as typeof globalThis & {
    [TRADE_LIST_PERF_STATE_KEY]?: TradeListPerfState;
  };
  if (!g[TRADE_LIST_PERF_STATE_KEY]) {
    g[TRADE_LIST_PERF_STATE_KEY] = {
      recorded: {},
      productCardRenderCount: 0,
    };
  }
  return g[TRADE_LIST_PERF_STATE_KEY]!;
}

export function recordTradeListMetricOnce(metricKey: string, value?: number): void {
  const state = getTradeListPerfState();
  if (state.recorded[metricKey]) return;
  state.recorded[metricKey] = true;
  recordAppWidePhaseLastMs(metricKey, Math.round(value ?? performance.now()));
}

export function recordTradeListMetric(metricKey: string, value: number): void {
  recordAppWidePhaseLastMs(metricKey, Math.round(value));
}

export function bumpTradeListProductCardRenderCount(): number {
  const state = getTradeListPerfState();
  state.productCardRenderCount += 1;
  recordAppWidePhaseLastMs("trade_list_product_card_render_count", state.productCardRenderCount);
  return state.productCardRenderCount;
}

export function recordTradeListImageRequestRangeFromResources(imgSrc: string | null | undefined): boolean {
  if (!imgSrc || typeof performance === "undefined") return false;
  const normalizedSrc = imgSrc.replace(/^https?:/, "");
  const candidates = performance
    .getEntriesByType("resource")
    .filter((entry): entry is PerformanceResourceTiming => entry instanceof PerformanceResourceTiming)
    .filter((entry) => {
      const target = entry.name;
      const normalizedTarget = target.replace(/^https?:/, "");
      return (
        target === imgSrc ||
        target.includes(imgSrc) ||
        imgSrc.includes(target) ||
        normalizedTarget === normalizedSrc ||
        normalizedTarget.includes(normalizedSrc) ||
        normalizedSrc.includes(normalizedTarget)
      );
    })
    .sort((a, b) => a.startTime - b.startTime);
  const picked = candidates[0];
  if (!picked) return false;
  recordTradeListMetricOnce("trade_list_first_card_image_request_start_ms", picked.startTime);
  recordTradeListMetricOnce(
    "trade_list_first_card_image_request_end_ms",
    picked.responseEnd || picked.startTime + picked.duration
  );
  return true;
}
