/** 매장 포인트 overlay — is_open 과 별도 주문 가능 여부 */

export type StorePointCommerceFields = {
  point_commerce_blocked?: boolean | null;
  point_balance?: number | null;
};

export function isStorePointCommerceBlocked(
  store: StorePointCommerceFields | null | undefined
): boolean {
  return store?.point_commerce_blocked === true;
}

/**
 * 영업 스케줄(is_open·hours) 통과 후 포인트 overlay 적용.
 * blocked 이면 고객 주문 불가(준비중 UX).
 */
export function resolveStoreFrontOrderable(
  scheduleOpen: boolean,
  store: StorePointCommerceFields | null | undefined
): boolean {
  if (!scheduleOpen) return false;
  if (isStorePointCommerceBlocked(store)) return false;
  return true;
}
