/**
 * `/my/business` 하위 경로 → 메인 컬럼 제목 (대시보드는 null)
 */
export function getBusinessAdminPageTitle(pathname: string): string | null {
  const raw = pathname.split("?")[0] ?? pathname;
  const p = raw.replace(/\/+$/, "") || "/";

  if (p === "/my/business") return null;
  if (p === "/my/business/store-orders") return "주문 관리";
  if (p === "/my/business/inquiries") return "채팅 · 문의";
  if (p === "/my/business/settlements") return "정산";
  if (p === "/my/business/menu-categories") return "메뉴 카테고리";
  if (p === "/my/business/products/new" || p.startsWith("/my/business/products/new/")) {
    return "상품 등록";
  }
  if (/^\/my\/business\/products\/[^/]+\/edit$/.test(p)) return "상품 수정";
  if (p === "/my/business/products") return "상품 등록";
  if (p === "/my/business/basic-info") return "기본 정보";
  if (p === "/my/business/profile") return "매장 프로필";
  if (p === "/my/business/ops-status") return "운영 · 심사";
  if (p === "/my/business/reviews") return "리뷰 관리";
  if (p === "/my/business/settings") return "설정";
  if (p === "/my/business/edit") return "상점 정보";
  if (p === "/my/business/apply") return "매장 신청";

  if (/^\/my\/business\/store-order-chat\/[^/]+$/.test(p)) return "주문 채팅";

  return "매장 어드민";
}
