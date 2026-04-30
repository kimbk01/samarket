/**
 * 관리자·내부 도구에서 웹 앱 공개 URL과 맞추기
 * - 거래 물품 상세: `/post/[id]` (레거시 `/products/[id]` 는 동일 글로 리다이렉트)
 * - 카테고리 목록: app/(main)/market/[slug]/page.tsx → /market/[slug]
 */

export function getPublicProductPath(postId: string): string {
  const id = postId?.trim();
  return id ? `/post/${id}` : "/philife";
}

export function getMarketCategoryPath(categorySlug: string | undefined | null): string | null {
  const s = categorySlug?.trim();
  if (!s) return null;
  return `/market/${encodeURIComponent(s)}`;
}
