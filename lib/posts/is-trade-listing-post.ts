/**
 * DB에 type 미설정(null)인 중고거래 글이 많아, 명시적 비거래 타입만 제외하고 거래 목록 UI(배지·진행)에 사용
 */
export function isTradeListingPost(post: { type?: string | null }): boolean {
  const t = post.type;
  if (t === "trade") return true;
  if (t === "community" || t === "service" || t === "feature") return false;
  return true;
}
