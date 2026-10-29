/**
 * v4 API-18 — 고객 공개 상품 상세 응답에서 내부 필드 제거 (단일 정의).
 *
 * - `admin_review_status`: 노출 판정(`storeProductBuyerVisibilityBlocked`) 후 항상 제거.
 * - `stock_qty`: 재고 추적 상품(`track_inventory=true`)만 화면이 수량 상한·품절 판정에 쓴다
 *   (`StoreProductPublic` capQty·soldOut). 재고 미추적 상품은 쓰지 않으므로 제거해 재고 수치를 내보내지 않는다.
 */
export function stripStoreProductPublicInternalFields(row: Record<string, unknown>): void {
  delete row.admin_review_status;
  if (row.track_inventory !== true) delete row.stock_qty;
}
