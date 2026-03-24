/** 주문 직후 장바구니 페이지로 돌아왔을 때(뒤로 가기 등) UI·중복 주문 방지용 — session 전용, 탭 닫으면 사라짐 */

const PREFIX = "kasama:last-store-checkout-order:";

export function setLastCheckoutOrderId(storeId: string, orderId: string): void {
  if (typeof window === "undefined" || !storeId || !orderId) return;
  try {
    sessionStorage.setItem(PREFIX + storeId, orderId);
  } catch {
    /* ignore */
  }
}

export function getLastCheckoutOrderId(storeId: string): string | null {
  if (typeof window === "undefined" || !storeId) return null;
  try {
    return sessionStorage.getItem(PREFIX + storeId);
  } catch {
    return null;
  }
}

export function clearLastCheckoutOrderId(storeId: string): void {
  if (typeof window === "undefined" || !storeId) return;
  try {
    sessionStorage.removeItem(PREFIX + storeId);
  } catch {
    /* ignore */
  }
}
