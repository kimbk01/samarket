/**
 * 관리자·내부 도구에서 웹 앱 공개 URL과 맞추기
 * - 상품 상세: app/(main)/products/[id]/page.tsx → /products/[id]
 * - 카테고리 목록: app/(main)/market/[slug]/page.tsx → /market/[slug]
 */

export function getPublicProductPath(postId: string): string {
  const id = postId?.trim();
  return id ? `/products/${id}` : "/products";
}

export function getMarketCategoryPath(categorySlug: string | undefined | null): string | null {
  const s = categorySlug?.trim();
  if (!s) return null;
  return `/market/${encodeURIComponent(s)}`;
}
