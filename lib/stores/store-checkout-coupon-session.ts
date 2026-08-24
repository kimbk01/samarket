const STORE_CHECKOUT_COUPON_SESSION_KEY = "store_checkout_coupon_campaign_v1";

export type StoreCheckoutCouponSession = {
  storeId: string;
  campaignId: string;
};

export function writeStoreCheckoutCouponSession(input: StoreCheckoutCouponSession): void {
  if (typeof window === "undefined") return;
  try {
    sessionStorage.setItem(STORE_CHECKOUT_COUPON_SESSION_KEY, JSON.stringify(input));
  } catch {
    /* ignore quota */
  }
}

export function readStoreCheckoutCouponSession(storeId: string): StoreCheckoutCouponSession | null {
  if (typeof window === "undefined") return null;
  try {
    const raw = sessionStorage.getItem(STORE_CHECKOUT_COUPON_SESSION_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as StoreCheckoutCouponSession;
    if (parsed?.storeId !== storeId || !parsed?.campaignId?.trim()) return null;
    return { storeId: parsed.storeId, campaignId: parsed.campaignId.trim() };
  } catch {
    return null;
  }
}

export function clearStoreCheckoutCouponSession(): void {
  if (typeof window === "undefined") return;
  try {
    sessionStorage.removeItem(STORE_CHECKOUT_COUPON_SESSION_KEY);
  } catch {
    /* ignore */
  }
}
