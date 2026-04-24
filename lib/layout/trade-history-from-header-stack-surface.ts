/**
 * 헤더 `+` → 거래 내역이 **URL 이동 대신** 슬라이드 스택(`TradeHistoryFromHeaderStack`)을 쓰는 표면.
 * 메신저 헤더 스택과 동일 경로 집합.
 */
export function isTradeHistoryFromHeaderStackSurface(pathname: string | null | undefined): boolean {
  const p = (pathname?.split("?")[0] ?? "").trim();
  if (p === "/home") return true;
  if (p === "/market") return true;
  if (p.startsWith("/market/")) return true;
  return false;
}
