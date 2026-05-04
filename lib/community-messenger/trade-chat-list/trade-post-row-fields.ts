import type { TradeChatCategoryMetaLike } from "@/lib/community-messenger/trade-chat-list/category-menu-label";

export function tradePostCategoryId(post: Record<string, unknown> | null | undefined): string {
  const a = typeof post?.trade_category_id === "string" ? post.trade_category_id.trim() : "";
  if (a) return a;
  const b = typeof post?.category_id === "string" ? post.category_id.trim() : "";
  return b;
}

/**
 * 거래 채팅 목록·contextMeta 용 한 줄 제목 — `title` 이 비면 `meta` 흔한 키를 순서대로 시도.
 */
export function tradePostHeadlineForMessengerList(post: Record<string, unknown> | null | undefined): string {
  const direct = typeof post?.title === "string" ? post.title.trim() : "";
  if (direct) return direct;
  const m = post?.meta;
  if (m && typeof m === "object" && !Array.isArray(m)) {
    const rec = m as Record<string, unknown>;
    for (const k of ["listing_title", "title", "product_title", "subject", "name", "headline"]) {
      const v = rec[k];
      if (typeof v === "string" && v.trim()) return v.trim();
    }
  }
  return "";
}

/** `trade_category_id` 로 조회한 카테고리 행의 `name` — 목록 1행 칩(세부 구분)용 */
export function tradeChatProductCategoryDisplayName(
  post: Record<string, unknown> | null | undefined,
  categoryById: Map<string, TradeChatCategoryMetaLike>
): string | null {
  const id = tradePostCategoryId(post);
  if (!id) return null;
  const cat = categoryById.get(id);
  const name = typeof cat?.name === "string" ? cat.name.trim() : "";
  return name.length ? name : null;
}
