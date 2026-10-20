/**
 * 구매자 판매 가능 판정 (PRD-03 · PRD-05) — 「노출 = 주문 가능」.
 * 메뉴 스냅샷 RPC · 상세 API · 체크아웃 TS 검증 · 주문 RPC(create_store_order_atomic Pass1)가 같은 규칙.
 * - 검수 반려·재검수 대기 → 판매 불가
 * - 숨김 메뉴 구역(store_menu_sections.is_hidden) 상품 → 판매 불가 (구역 없는 「기타 메뉴」는 판매 가능)
 */
import { isStoreProductReviewUnsellable } from "@/lib/stores/store-product-admin-lock";

/** PostgREST embed `store_menu_sections` (object 또는 1행 배열) */
export function isStoreProductSectionHidden(embed: unknown): boolean {
  const one: unknown = Array.isArray(embed) ? embed[0] : embed;
  return one != null && typeof one === "object" && (one as { is_hidden?: unknown }).is_hidden === true;
}

/** 상태(active/sold_out) 판정 전에 적용하는 노출 게이트 — 걸리면 `product_not_available` */
export function storeProductBuyerVisibilityBlocked(row: Record<string, unknown> | {
  admin_review_status?: unknown;
  store_menu_sections?: unknown;
}): boolean {
  const r = row as { admin_review_status?: unknown; store_menu_sections?: unknown };
  return (
    isStoreProductReviewUnsellable(r.admin_review_status) ||
    isStoreProductSectionHidden(r.store_menu_sections)
  );
}
