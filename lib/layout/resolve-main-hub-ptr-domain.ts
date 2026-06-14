export type MainHubPtrDomain = "trade" | "philife" | "stores";

/**
 * 메인 허브 PTR touch 리스너 — pathname 기준 단일 도메인.
 * 동시에 하나만 `preventDefault` 리스너를 붙여 스크롤 충돌을 막는다.
 */
export function resolveMainHubPtrDomain(pathname: string | null | undefined): MainHubPtrDomain | null {
  const p = (pathname ?? "").split("?")[0]?.trim() ?? "";
  if (p === "/market") return "trade";
  if (p.startsWith("/market/")) {
    if (p === "/market/trade-meet-spot" || p.startsWith("/market/trade-meet-spot/")) return null;
    return "trade";
  }
  if (p === "/philife") return "philife";
  if (p === "/stores" || p === "/stores/") return "stores";
  return null;
}
