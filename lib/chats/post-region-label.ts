/**
 * 채팅 상단 상품카드용 지역 라벨 (posts.region / city / barangay)
 */
export function buildPostRegionLabel(post: Record<string, unknown> | null | undefined): string {
  if (!post) return "";
  const parts = [post.region, post.city, post.barangay]
    .map((x) => (typeof x === "string" ? x.trim() : ""))
    .filter(Boolean);
  return parts.join(" · ");
}
