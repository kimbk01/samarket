import { normalizeMarketSlugParam } from "@/lib/categories/tradeMarketPath";

/** `/market`·`/market/[slug]` PTR — `trade-meet-spot` 제외 */
export function isTradeMarketPullRefreshSurface(pathname: string | null | undefined): boolean {
  const p = (pathname ?? "").split("?")[0]!.trim();
  if (p === "/market") return true;
  if (!p.startsWith("/market/")) return false;
  if (p === "/market/trade-meet-spot" || p.startsWith("/market/trade-meet-spot/")) return false;
  return true;
}

export function buildTradeMarketPullRefreshRouteKeyFromSegment(
  segment: string | null | undefined
): string | null {
  const norm = normalizeMarketSlugParam(segment ?? "");
  return norm ? `/market/${norm}` : null;
}

/** 현재 경로에 대응하는 PTR 핸들러 키 — 홈·카테고리 피드별 단일 새로고침 */
export function resolveTradeMarketPullRefreshRouteKey(pathname: string | null | undefined): string | null {
  const p = (pathname ?? "").split("?")[0]!.trim();
  if (!isTradeMarketPullRefreshSurface(p)) return null;
  if (p === "/market") return "/market";
  const m = p.match(/^\/market\/([^/]+)$/);
  if (!m) return null;
  return buildTradeMarketPullRefreshRouteKeyFromSegment(m[1]);
}
