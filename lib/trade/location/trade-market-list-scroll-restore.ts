/**
 * Marketplace /market 목록 → 상세 → 뒤로: 「방금 본 카드」 표시(selected listing)만 담당.
 * 목록 스크롤 위치 저장·복원은 앱 공용 규칙(`lib/navigation/app-scroll-memory.ts`) 1곳이 한다 (스크롤 SSOT 2026-11-03).
 */
import { isTradeSearchPath } from "@/lib/trade/search/trade-search-paths";

const KEY_SELECTED = "samarket:trade-market-list-selected:v1";
const TTL_MS = 120_000;

export function buildTradeMarketListScrollRouteKey(pathname: string, search?: string): string {
  const p = (pathname || "").split("?")[0] || "/market";
  const q = (search ?? "").replace(/^\?/, "").trim();
  return q ? `${p}?${q}` : p;
}

export function isTradeMarketListScrollRoute(routeKey: string): boolean {
  const path = (routeKey || "").split("?")[0] ?? "";
  if (path === "/market") return true;
  if (
    path.startsWith("/market/location") ||
    path.startsWith("/market/sell") ||
    path.startsWith("/market/trade-meet-spot") ||
    isTradeSearchPath(path)
  ) {
    return false;
  }
  return /^\/market\/[^/]+$/.test(path);
}

export function rememberTradeMarketSelectedListing(postId: string, routeKey: string): void {
  if (typeof sessionStorage === "undefined") return;
  const id = postId.trim();
  if (!id) return;
  try {
    sessionStorage.setItem(
      KEY_SELECTED,
      JSON.stringify({ id, routeKey, saved_at: Date.now() })
    );
  } catch {
    /* quota */
  }
}

export function peekTradeMarketSelectedListing(
  routeKey: string
): string | null {
  if (typeof sessionStorage === "undefined") return null;
  try {
    const raw = sessionStorage.getItem(KEY_SELECTED);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as { id?: string; routeKey?: string; saved_at?: number };
    if (!parsed?.saved_at || parsed.saved_at + TTL_MS < Date.now()) {
      sessionStorage.removeItem(KEY_SELECTED);
      return null;
    }
    if ((parsed.routeKey ?? "") !== routeKey) return null;
    return typeof parsed.id === "string" && parsed.id.trim() ? parsed.id.trim() : null;
  } catch {
    return null;
  }
}

export function clearTradeMarketSelectedListing(): void {
  if (typeof sessionStorage === "undefined") return;
  try {
    sessionStorage.removeItem(KEY_SELECTED);
  } catch {
    /* ignore */
  }
}

/** Call immediately before navigating list → /post/[id]. */
export function prepareTradeMarketListToDetailNavigation(input: {
  routeKey: string;
  postId: string;
}): void {
  rememberTradeMarketSelectedListing(input.postId, input.routeKey);
}
