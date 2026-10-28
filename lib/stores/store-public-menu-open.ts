/**
 * 고객이 매장 메뉴를 볼 수 있는가 — 판매 승인 매장 또는 샘플(체험용) 매장 (2026-10-28 배달 감사 §F S-4).
 * 샘플은 판매 승인을 받지 않으므로(DB 트리거로 금지) 주문은 `create_store_order_atomic`(store_not_selling)·
 * `resolveStoreOrderability`(sample_store) 가 막고, 메뉴는 이 판정으로 보여 준다.
 *
 * SQL 쌍: `public.store_public_menu_open(store_id)` (메뉴 스냅샷 RPC 의 can_sell). 두 정의는
 * `lib/stores/__tests__/store-public-menu-open.test.ts` 가 같은 조건인지 고정한다.
 */
export function isStorePublicMenuOpen(input: {
  perm: { allowed_to_sell?: unknown; sales_status?: unknown } | null | undefined;
  storeKind: unknown;
}): boolean {
  const salesApproved =
    !!input.perm && input.perm.allowed_to_sell === true && input.perm.sales_status === "approved";
  return salesApproved || input.storeKind === "sample";
}
