import type { TradeFeedClientSort } from "@/lib/posts/trade-feed-client-cache";

/**
 * `GET /api/trade/feed` · 클라 피드 캐시와 동일 — `sort` 우선, 레거시 `fs` 폴백.
 */
export function parseTradeFeedSortQuery(raw: string | null | undefined): TradeFeedClientSort {
  const s = (raw ?? "").trim().toLowerCase();
  if (s === "popular") return "popular";
  if (s === "pay_desc") return "pay_desc";
  if (s === "chat_desc") return "chat_desc";
  if (s === "near" || s === "distance") return "near";
  return "latest";
}
