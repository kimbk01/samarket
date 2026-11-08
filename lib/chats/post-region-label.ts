import { resolveTradeListingPublicCityLabel } from "@/lib/posts/post-listing-location-label";

/**
 * 채팅 상단 상품카드 지역 — ① 공개 지역(시/군), 거래 카드·상세와 같은 함수(주소 표시 SSOT).
 * 이전: posts.region · city · barangay 원본(「quezon · q1」 내부 ID 노출).
 */
export function buildPostRegionLabel(post: Record<string, unknown> | null | undefined): string {
  if (!post) return "";
  const str = (v: unknown) => (typeof v === "string" ? v.trim() : "");
  return (
    resolveTradeListingPublicCityLabel({
      tradeLguId: str(post.trade_lgu_id) || null,
      region: str(post.region) || null,
      city: str(post.city) || null,
    }) ?? ""
  );
}
