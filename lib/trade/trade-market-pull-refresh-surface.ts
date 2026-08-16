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

/**
 * PTR 핸들러 조회용 쿼리 정규화 — 주제·정렬·거래상태·알바 필터만 포함(피드 조건과 동일).
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
  const out = new URLSearchParams();

  const topic = (params.get("topic") ?? "").trim().normalize("NFC");
  if (topic) out.set("topic", topic);

  const category = (params.get("category") ?? "").trim().normalize("NFC");
  if (category) out.set("category", category);

  const fsRaw = (params.get("fs") ?? params.get("sort") ?? "").trim().toLowerCase();
  if (fsRaw === "popular" || fsRaw === "pay_desc" || fsRaw === "chat_desc" || fsRaw === "near") {
    out.set("fs", fsRaw);
  }

  const tradeState = (params.get("tradeState") ?? "").trim();
  if (tradeState === "active" || tradeState === "reserved" || tradeState === "sold") {
    out.set("tradeState", tradeState);
  }

  const jk = (params.get("jk") ?? "").trim().toLowerCase();
  if (jk === "hire" || jk === "work") out.set("jk", jk);

  const je = (params.get("je") ?? "").trim();
  if (je) out.set("je", je);

  if (params.get("av") === "1" || params.get("av")?.trim().toLowerCase() === "true") {
    out.set("av", "1");
  }

  const jr = (params.get("jr") ?? "").trim().toLowerCase();
  if (jr) out.set("jr", jr);

  const jc = (params.get("jc") ?? "").trim().toLowerCase();
  if (jc) out.set("jc", jc);

  return [...out.entries()]
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
