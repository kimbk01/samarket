/**
 * FREE COUPON handoff v2 — SSOT: authority = storeId + userCouponId only.
 * couponNumber / offerId (campaignId) are display helpers — never auth inputs.
 * Offer-id-only (legacy campaign-only) session is invalid and cleared.
 */

const HANDOFF_KEY = "store_checkout_coupon_handoff_v2";
const LEGACY_SESSION_KEY = "store_checkout_coupon_campaign_v1";
const TTL_MS = 30 * 60 * 1000;

export type StoreCouponHandoffV2 = {
  v: 2;
  storeId: string;
  userCouponId: string;
  /** Display only — not authority */
  couponNumber: string;
  /** Offer id display alias — not authority */
  offerId: string;
  createdAtMs: number;
};

function isUuidLike(s: string): boolean {
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(s);
}

export function writeStoreCouponHandoff(input: {
  storeId: string;
  userCouponId: string;
  couponNumber?: string | null;
  /** @deprecated alias — use offerId */
  campaignId?: string | null;
  offerId?: string | null;
}): void {
  if (typeof window === "undefined") return;
  const storeId = input.storeId.trim();
  const userCouponId = input.userCouponId.trim();
  if (!storeId || !userCouponId || !isUuidLike(userCouponId)) return;
  const offerId = String(input.offerId ?? input.campaignId ?? "").trim();
  const couponNumber = String(input.couponNumber ?? "").trim();
  const payload: StoreCouponHandoffV2 = {
    v: 2,
    storeId,
    userCouponId,
    couponNumber,
    offerId,
    createdAtMs: Date.now(),
  };
  try {
    sessionStorage.setItem(HANDOFF_KEY, JSON.stringify(payload));
    sessionStorage.removeItem(LEGACY_SESSION_KEY);
  } catch {
    /* ignore quota */
  }
}

export function readStoreCouponHandoff(storeId: string): StoreCouponHandoffV2 | null {
  if (typeof window === "undefined") return null;
  try {
    sessionStorage.removeItem(LEGACY_SESSION_KEY);
    const raw = sessionStorage.getItem(HANDOFF_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as StoreCouponHandoffV2 & { campaignId?: string };
    if (parsed?.v !== 2) {
      sessionStorage.removeItem(HANDOFF_KEY);
      return null;
    }
    if (parsed.storeId !== storeId) return null;
    if (!parsed.userCouponId?.trim() || !isUuidLike(parsed.userCouponId)) {
      sessionStorage.removeItem(HANDOFF_KEY);
      return null;
    }
    if (!Number.isFinite(parsed.createdAtMs) || Date.now() - parsed.createdAtMs > TTL_MS) {
      sessionStorage.removeItem(HANDOFF_KEY);
      return null;
    }
    return {
      v: 2,
      storeId: parsed.storeId,
      userCouponId: parsed.userCouponId.trim(),
      couponNumber: String(parsed.couponNumber ?? "").trim(),
      offerId: String(parsed.offerId ?? parsed.campaignId ?? "").trim(),
      createdAtMs: parsed.createdAtMs,
    };
  } catch {
    return null;
  }
}

export function clearStoreCouponHandoff(): void {
  if (typeof window === "undefined") return;
  try {
    sessionStorage.removeItem(HANDOFF_KEY);
    sessionStorage.removeItem(LEGACY_SESSION_KEY);
  } catch {
    /* ignore */
  }
}
