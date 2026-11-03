/**
 * D1 (Owner 2026-11-03): 글쓰기 시트 코드 조각을 미리 받아 둔다 — 「판매하기」 화면이 열릴 때·누를 때.
 * 같은 import 는 브라우저가 한 번만 받는다(여러 번 불러도 안전).
 */
export function preloadTradeWriteSheet(): void {
  if (typeof window === "undefined") return;
  void import("@/components/trade/TradeWriteBottomSheet").catch(() => {
    /* 실패해도 열 때 다시 받는다 */
  });
}
