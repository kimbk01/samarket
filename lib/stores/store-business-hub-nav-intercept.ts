/**
 * 심사 중·반려 등: 매장 오너 운영 화면(`/stores/owner` 캐노니컬, 옛 `/my/business`·`/mypage/business`)
 * 진입은 모달로 안내할 때 사용. 신청·프로필·기본 정보(온보딩)는 예외 — 내정보 매장 탭·상단 Owner 바와 동일 규칙.
 */
export function shouldInterceptBusinessHubHref(href: string): boolean {
  // 옛 경로를 새 경로로 정규화한 뒤 비교 — 호출 측이 어느 URL 로 가리키든 동일하게 판단.
  let normalized = href;
  if (normalized.startsWith("/mypage/business")) {
    normalized = normalized.replace("/mypage/business", "/stores/owner");
  } else if (normalized.startsWith("/my/business")) {
    normalized = normalized.replace("/my/business", "/stores/owner");
  }
  if (!normalized.startsWith("/stores/owner")) return false;
  if (normalized.startsWith("/stores/owner/apply")) return false;
  if (normalized.startsWith("/stores/owner/profile")) return false;
  if (normalized.startsWith("/stores/owner/basic-info")) return false;
  return true;
}
