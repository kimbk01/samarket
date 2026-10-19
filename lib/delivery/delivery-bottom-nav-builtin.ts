/**
 * 하단 메뉴 「내매장」 내장 항목 판별 — 클라이언트·서버 공용 (서버 전용 모듈 import 금지).
 * 관리자 하단 메뉴 화면(클라이언트)이 서버 로더(`load-delivery-bottom-nav-items-server`)를 import 하지 않도록 분리.
 */
export function isDeliveryBottomNavBuiltinOwnerStoreItem(i: { icon_key: string; href: string }): boolean {
  if (i.icon_key !== "store") return false;
  const h = String(i.href ?? "").trim();
  return (
    h === "/stores/owner" ||
    h.startsWith("/stores/owner/") ||
    h === "/mypage/business" ||
    h.startsWith("/mypage/business/") ||
    h === "/my/business" ||
    h.startsWith("/my/business/")
  );
}
