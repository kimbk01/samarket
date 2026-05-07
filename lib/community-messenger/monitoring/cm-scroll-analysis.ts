/**
 * Community 메신저 방 스크롤·프리펜드·키보드 안정성 분석 — 관측 전용.
 * `NEXT_PUBLIC_MESSENGER_PERF_TRACE_CM_SCROLL=1`
 */

let layoutShiftSessionCount = 0;
let layoutShiftObserver: PerformanceObserver | null = null;

/** 가상 행 measureElement 호출 누적 (프레임당 드레인) */
let virtualizerMeasureSumMs = 0;
let virtualizerMeasureCalls = 0;

export function cmScrollAnalysisEnabled(): boolean {
  try {
    return typeof process !== "undefined" && process.env.NEXT_PUBLIC_MESSENGER_PERF_TRACE_CM_SCROLL === "1";
  } catch {
    return false;
  }
}

export function resetCmScrollAnalysisSession(): void {
  if (!cmScrollAnalysisEnabled()) return;
  layoutShiftSessionCount = 0;
  virtualizerMeasureSumMs = 0;
  virtualizerMeasureCalls = 0;
}

/** 레이아웃 시프트만 초기화 — append 직전 스냅샷용 */
export function resetCmScrollLayoutShiftSession(): void {
  layoutShiftSessionCount = 0;
}

export function recordCmScrollVirtualizerMeasure(ms: number): void {
  if (!cmScrollAnalysisEnabled()) return;
  if (!Number.isFinite(ms) || ms < 0) return;
  virtualizerMeasureSumMs += ms;
  virtualizerMeasureCalls += 1;
}

export function drainCmScrollVirtualizerRecalcMs(): { virtualizer_recalc_ms: number | null; measure_calls: number } {
  if (!cmScrollAnalysisEnabled() || virtualizerMeasureCalls === 0) {
    return { virtualizer_recalc_ms: null, measure_calls: 0 };
  }
  const ms = Math.round(virtualizerMeasureSumMs * 1000) / 1000;
  const calls = virtualizerMeasureCalls;
  virtualizerMeasureSumMs = 0;
  virtualizerMeasureCalls = 0;
  return { virtualizer_recalc_ms: ms, measure_calls: calls };
}

export function ensureCmScrollLayoutShiftObserver(): void {
  if (!cmScrollAnalysisEnabled() || typeof PerformanceObserver === "undefined") return;
  if (layoutShiftObserver) return;
  try {
    layoutShiftObserver = new PerformanceObserver((list) => {
      for (const e of list.getEntries()) {
        if ("hadRecentInput" in e && (e as LayoutShift).hadRecentInput) continue;
        layoutShiftSessionCount += 1;
      }
    });
    layoutShiftObserver.observe({ type: "layout-shift", buffered: true } as PerformanceObserverInit);
  } catch {
    layoutShiftObserver = null;
  }
}

type LayoutShift = PerformanceEntry & { hadRecentInput?: boolean };

export function disposeCmScrollLayoutShiftObserver(): void {
  try {
    layoutShiftObserver?.disconnect();
  } catch {
    /* ignore */
  }
  layoutShiftObserver = null;
}

export function getCmScrollLayoutShiftCount(): number {
  return layoutShiftSessionCount;
}

export type CmScrollAnalysisPayload = {
  append_scroll_adjust_ms?: number | null;
  prepend_scroll_restore_ms?: number | null;
  layout_shift_after_append?: number;
  keyboard_viewport_shift_ms?: number | null;
  virtualizer_recalc_ms?: number | null;
  auto_scroll_triggered?: boolean;
  auto_scroll_reason?: string;
  bottom_distance_px?: number | null;
  visible_window_jump_px?: number | null;
  /** 세션 누적 layout-shift 항목 수(브라우저가 보고한 항목) */
  layout_shift_session_total?: number;
  room_id_suffix?: string;
};

export function logCmScrollAnalysis(payload: CmScrollAnalysisPayload): void {
  if (!cmScrollAnalysisEnabled()) return;
  if (typeof console === "undefined" || typeof console.info !== "function") return;
  const merged: Record<string, unknown> = {
    ...payload,
    layout_shift_session_total: layoutShiftSessionCount,
  };
  console.info("[cm-scroll-analysis]", JSON.stringify(merged));
}
