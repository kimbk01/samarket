/**
 * Trade-blocked composer CTA "상품 상세보기" must open product detail — never a chat room href.
 * Prefer contextMeta.postId; fall back to trade listing product id when present.
 */
export function resolveTradeBlockedProductDetailPostId(input: {
  contextMetaKind?: string | null;
  contextMetaPostId?: string | null;
  tradeListingPostId?: string | null;
}): string | null {
  if (input.contextMetaKind !== "trade") return null;
  const fromMeta = String(input.contextMetaPostId ?? "").trim();
  if (fromMeta) return fromMeta;
  const fromListing = String(input.tradeListingPostId ?? "").trim();
  return fromListing || null;
}
