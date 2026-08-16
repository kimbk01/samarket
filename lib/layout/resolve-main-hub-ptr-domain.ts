export type MainHubPtrDomain = "trade" | "philife" | "stores" | "messenger";

/**
 * 메인 허브 PTR touch 리스너 — pathname 기준 단일 도메인.
 * 동시에 하나만 `preventDefault` 리스너를 붙여 스크롤 충돌을 막는다.
 */
export function resolveMainHubPtrDomain(pathname: string | null | undefined): MainHubPtrDomain | null {
  const p = (pathname ?? "").split("?")[0]?.trim() ?? "";
  if (p === "/market") return "trade";
  if (p.startsWith("/market/")) {
    if (p === "/market/trade-meet-spot" || p.startsWith("/market/trade-meet-spot/")) return null;
    if (p === "/market/location" || p.startsWith("/market/location/")) return null;
    return "trade";
  }
  if (p === "/" || p === "/philife") return "philife";
  if (p === "/stores" || p === "/stores/") return "stores";
  if (p === "/community-messenger" || p.startsWith("/community-messenger/")) {
    if (/^\/community-messenger\/rooms\/[^/]+$/.test(p)) return null;
    if (/^\/community-messenger\/calls\/[^/]+$/.test(p)) return null;
    return "messenger";
  }
  return null;
}
