/**
 * `TRADE_ENTRY_PERF_LOG=1` 일 때만 서버 콘솔에 단계별 ms (누적·구간).
 * 프로덕션 기본은 오프.
 */

const ENABLED = process.env.TRADE_ENTRY_PERF_LOG === "1";

export type TradeEntryPerfTrace = {
  /** 구간 소요(ms) — 직전 mark 이후 */
  mark: (phase: string) => void;
  /** 스코프 레이블과 함께 한 줄 로그 */
  finish: (scope: string, extra?: Record<string, unknown>) => void;
};

export function createTradeEntryPerfTrace(): TradeEntryPerfTrace | null {
  if (!ENABLED) return null;
  const tStart = performance.now();
  const segments: Record<string, number> = {};
  let tLast = tStart;

  return {
    mark(phase: string) {
      const now = performance.now();
      segments[phase] = Math.round(now - tLast);
      tLast = now;
    },
    finish(scope: string, extra?: Record<string, unknown>) {
      segments._total_ms = Math.round(performance.now() - tStart);
      console.info(`[trade-entry-perf] ${scope}`, { ...segments, ...extra });
    },
  };
}
