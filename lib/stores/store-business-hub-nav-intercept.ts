/**
 * 심사 중·반려 등: `/my/business` 운영 화면 진입은 모달로 안내할 때 사용.
 * 신청·프로필·기본 정보(온보딩)는 예외 — 내정보 매장 탭·상단 Owner 바와 동일 규칙.
 */
export function shouldInterceptBusinessHubHref(href: string): boolean {
  const normalized = href.startsWith("/mypage/business")
    ? href.replace("/mypage/business", "/my/business")
    : href;
  if (!normalized.startsWith("/my/business")) return false;
  if (normalized.startsWith("/my/business/apply")) return false;
  if (normalized.startsWith("/my/business/profile")) return false;
  if (normalized.startsWith("/my/business/basic-info")) return false;
  return true;
}
