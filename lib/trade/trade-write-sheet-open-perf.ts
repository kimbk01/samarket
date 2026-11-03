/**
 * D1 계측 (재감사 2026-11-04 B-11): 「판매하기」 → 거래 글쓰기 시트 첫 화면까지 걸린 시간.
 * 브라우저 성능 기록(`performance.measure("trade-write-sheet:open")`)과 마지막 값(`window.__samarketTradeWriteSheetOpenMs`)에 남긴다.
 * 실기에서 WebView 원격 디버깅으로 읽는다. 목표 1초 미만 (`docs/samarket-performance-track-state.md` 체감 기준).
 */
const START_MARK = "trade-write-sheet:open-start";
const MEASURE = "trade-write-sheet:open";

export function markTradeWriteSheetOpenStart(): void {
  if (typeof performance === "undefined" || typeof performance.mark !== "function") return;
  try {
    performance.clearMarks(START_MARK);
    performance.mark(START_MARK);
  } catch {
    /* 계측 실패는 화면에 영향 없음 */
  }
}

/** 시트 첫 프레임에서 1회 — 시작 표시가 없으면(복원 열기 등) 남기지 않는다 */
export function recordTradeWriteSheetFirstFrame(): void {
  if (typeof performance === "undefined" || typeof performance.measure !== "function") return;
  try {
    if (performance.getEntriesByName(START_MARK, "mark").length === 0) return;
    performance.clearMeasures(MEASURE);
    const m = performance.measure(MEASURE, START_MARK);
    performance.clearMarks(START_MARK);
    const ms = m && typeof m.duration === "number" ? Math.round(m.duration) : null;
    if (ms != null && typeof window !== "undefined") {
      (window as unknown as { __samarketTradeWriteSheetOpenMs?: number }).__samarketTradeWriteSheetOpenMs = ms;
    }
  } catch {
    /* 계측 실패는 화면에 영향 없음 */
  }
}
