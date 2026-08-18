/**
 * 거래 1차 탭·카테고리 피드 URL — 커뮤니티(`buildCommunityFeedHref`)와 동일 모델.
 * CONTRACT: pathname 은 항상 `/market`, 카테고리는 `?category=` (페이지 push 금지).
 */

import { parseMarketplacePublicTradeState } from "@/lib/trade/marketplace/public-listing-status";

export function parseTradeMarketCategoryFromSearch(
  searchParams: URLSearchParams | { get(name: string): string | null }
): string {
  return (searchParams.get("category") ?? "").trim().normalize("NFC");
}

export type BuildTradeMarketFeedHrefOpts = {
  /** 1차 카테고리 id (또는 레거시 slug). 없으면 전체(`/market`) */
  categoryId?: string | null;
  tradeState?: "latest" | "active" | "reserved" | "sold" | string | null;
  topic?: string | null;
  /** 유지할 기존 쿼리(정렬 fs 등). category/tradeState/topic 은 opts 가 덮어씀 */
  baseSearch?: string | null;
};

/**
 * `/market` | `/market?category=…` (+ tradeState/topic).
 * DO NOT: `/market/{uuid}` — 탭 전환 시 pathname 변경·셸 슬라이드 유발.
 */
export function buildTradeMarketFeedHref(opts: BuildTradeMarketFeedHrefOpts = {}): string {
  const sp = new URLSearchParams();
  const categoryId = (opts.categoryId ?? "").trim();
  const base = (opts.baseSearch ?? "").trim();
  if (base) {
    const raw = base.startsWith("?") ? base.slice(1) : base;
    const incoming = new URLSearchParams(raw);
    for (const [k, v] of incoming.entries()) {
      if (k === "category" || k === "tradeState" || k === "topic") continue;
      /** 전체 = default Marketplace feed — q is search state, not all-feed. */
      if (!categoryId && k === "q") continue;
      sp.append(k, v);
    }
  }

  if (categoryId) sp.set("category", categoryId);

  const tradeState = parseMarketplacePublicTradeState(opts.tradeState);
  if (tradeState === "active" || tradeState === "sold") {
    sp.set("tradeState", tradeState);
  }

  const topic = (opts.topic ?? "").trim().normalize("NFC");
  if (topic) sp.set("topic", topic);

  const qs = sp.toString();
  return qs ? `/market?${qs}` : "/market";
}

/** `/market` 및 `/market/[slug]`(레거시) — location·meet-spot 제외 */
export function isTradeMarketHubPathname(pathname: string | null | undefined): boolean {
  const p = (pathname ?? "").split("?")[0]?.trim().replace(/\/+$/, "") || "";
  if (p === "/market") return true;
  if (!p.startsWith("/market/")) return false;
  if (p.startsWith("/market/location")) return false;
  if (p.startsWith("/market/trade-meet-spot")) return false;
  return true;
}
