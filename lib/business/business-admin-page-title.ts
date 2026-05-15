/**
 * 매장 운영 어드민(`/stores/owner/*` 캐노니컬, 옛 `/my/business/*`·`/mypage/business/*` 호환) 메인 컬럼 제목.
 * 대시보드는 null(BusinessAdminShell 헤더가 직접 결정).
 */
export function getBusinessAdminPageTitle(pathname: string): string | null {
  const raw = pathname.split("?")[0] ?? pathname;
  const p = raw.replace(/\/+$/, "") || "/";

  /**
   * 새 캐노니컬과 옛 경로(이행기간) 양쪽을 모두 인식해 동일 타이틀을 반환한다.
   * 옛 경로는 라우트 레벨에서 새 경로로 리다이렉트되지만, 사이드바·서버 사이드 헤더 등
   * 레거시 분기 잔재가 남아도 같은 타이틀이 보이게 한다.
   */
  const matchAny = (suffix: string): boolean =>
    p === `/stores/owner${suffix}` ||
    p === `/my/business${suffix}` ||
    p === `/mypage/business${suffix}`;

  const matchPattern = (re: RegExp): boolean => re.test(p);

  if (
    p === "/stores/owner" ||
    p === "/my/business" ||
    p === "/mypage/business"
  )
    return null;

  if (matchAny("/orders") || matchAny("/store-orders")) return "주문 관리";
  if (matchAny("/inquiries")) return "채팅 · 문의";
  if (matchAny("/settlements")) return "정산";
  if (matchAny("/menu-categories")) return "메뉴 카테고리";
  if (
    p === "/stores/owner/products/new" || p.startsWith("/stores/owner/products/new/") ||
    p === "/my/business/products/new" || p.startsWith("/my/business/products/new/")
  ) {
    return "상품 등록";
  }
  if (matchPattern(/^\/stores\/owner\/products\/[^/]+\/edit$/) || matchPattern(/^\/my\/business\/products\/[^/]+\/edit$/))
    return "상품 수정";
  if (matchAny("/products")) return "상품 관리 , 등록";
  if (matchAny("/basic-info")) return "기본 정보";
  if (matchAny("/profile")) return "매장 설정";
  if (matchAny("/ops-status")) return "운영 · 심사";
  if (matchAny("/reviews")) return "리뷰 관리";
  if (matchAny("/banners")) return "배너 관리";
  if (matchAny("/notices")) return "공지 관리";
  if (matchAny("/settings")) return "설정";
  if (matchAny("/edit")) return "상점 정보";
  if (matchAny("/apply")) return "매장 신청";

  if (
    matchPattern(/^\/stores\/owner\/order-chat\/[^/]+$/) ||
    matchPattern(/^\/my\/business\/store-order-chat\/[^/]+$/)
  )
    return "주문 채팅";

  return "매장 어드민";
}
