import { normalizeMarketSlugParam } from "@/lib/categories/tradeMarketPath";

/** Committed marketplace browse URL keys — PTR handler route key SSOT (not page/cursor/junk). */
const COMMITTED_BROWSE_QUERY_KEYS = new Set([
  "location",
  "lgu",
  "radius",
  "category",
  "categoryIds",
  "topic",
  "topicByRoot",
  "tradeState",
  "sort",
  "fs",
  "priceMin",
  "priceMax",
  "q",
]);

function isCommittedBrowseQueryKey(key: string): boolean {
  return COMMITTED_BROWSE_QUERY_KEYS.has(key) || key.startsWith("filters[");
}

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

/**
 * PTR 핸들러 조회용 쿼리 정규화 — committed browse keys only (page/cursor/unknown 제외).
 */
export function normalizeTradeMarketPullRefreshQuery(
  search: string | URLSearchParams | null | undefined
): string {
  if (search == null) return "";
  const raw =
    typeof search === "string"
      ? search.trim().replace(/^\?/, "")
      : search.toString().trim();
  if (!raw) return "";

  const params = new URLSearchParams(raw);
  const kept = new URLSearchParams();
  for (const [key, value] of params.entries()) {
    if (key === "page" || key === "cursor") continue;
    if (!isCommittedBrowseQueryKey(key)) continue;
    kept.append(key, value);
  }

  return [...kept.entries()]
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([k, v]) => `${k}=${encodeURIComponent(v)}`)
    .join("&");
}

/**
 * 현재 경로·쿼리에 대응하는 PTR 핸들러 키 — 홈·카테고리·주제 피드별 단일 새로고침.
 */
export function resolveTradeMarketPullRefreshRouteKey(
  pathname: string | null | undefined,
  search?: string | URLSearchParams | null
): string | null {
  const p = (pathname ?? "").split("?")[0]!.trim();
  if (!isTradeMarketPullRefreshSurface(p)) return null;

  let pathKey: string | null;
  if (p === "/market") {
    pathKey = "/market";
  } else {
    const m = p.match(/^\/market\/([^/]+)$/);
    if (!m) return null;
    pathKey = buildTradeMarketPullRefreshRouteKeyFromSegment(m[1]);
  }
  if (!pathKey) return null;

  const q = normalizeTradeMarketPullRefreshQuery(search);
  return q ? `${pathKey}?${q}` : pathKey;
}
