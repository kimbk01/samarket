/**
 * CUT 6 — ONE coupon eligibility authority (discovery + checkout).
 * Surface couponBadgeAllowed is NOT eligibility — see resolveCouponBadgeAllowed*.
 */

import {
  isStoreCouponCampaignActive,
  isStoreCouponDiscountType,
  type StoreCouponCampaignRow,
} from "@/lib/stores/store-coupon-campaign-authority";

export type StoreCouponEligibilityFactors = {
  campaignActive: boolean;
  windowActive: boolean;
  storeMatched: boolean;
  /** Discovery: true when order amount not in context. Checkout: min-order check. */
  minOrderMet: boolean;
  /** Discovery: true when redemption not in context. Checkout: per-buyer unique. */
  notAlreadyRedeemed: boolean;
  discountComputable: boolean;
};

export const STORE_COUPON_ELIGIBILITY_FACTOR_KEYS = [
  "campaignActive",
  "windowActive",
  "storeMatched",
  "minOrderMet",
  "notAlreadyRedeemed",
  "discountComputable",
] as const satisfies readonly (keyof StoreCouponEligibilityFactors)[];

export type StoreCouponBlockingReason = (typeof STORE_COUPON_ELIGIBILITY_FACTOR_KEYS)[number];

export type StoreCouponEligibilityState = {
  factors: StoreCouponEligibilityFactors;
  eligible: boolean;
  blockingReasons: StoreCouponBlockingReason[];
};

export type ResolveStoreCouponEligibilityInput = {
  campaign: StoreCouponCampaignRow;
  nowMs?: number;
  /** When set, campaign.storeId must match. */
  expectedStoreId?: string | null;
  /**
   * When number: evaluate min_order_amount.
   * When null/undefined: discovery mode — minOrderMet = true (not evaluated).
   */
  itemGrossPhp?: number | null;
  /**
   * When boolean: evaluate redemption.
   * When null/undefined: discovery mode — notAlreadyRedeemed = true (not evaluated).
   */
  alreadyRedeemed?: boolean | null;
};

function windowActive(row: StoreCouponCampaignRow, nowMs: number): boolean {
  const startMs = Date.parse(row.startAt);
  const endMs = Date.parse(row.endAt);
  if (!Number.isFinite(startMs) || !Number.isFinite(endMs) || endMs <= startMs) return false;
  return startMs <= nowMs && endMs > nowMs;
}

export function deriveStoreCouponEligibilityState(
  factors: StoreCouponEligibilityFactors
): StoreCouponEligibilityState {
  const blockingReasons: StoreCouponBlockingReason[] = [];
  for (const key of STORE_COUPON_ELIGIBILITY_FACTOR_KEYS) {
    if (!factors[key]) blockingReasons.push(key);
  }
  return {
    factors,
    eligible: blockingReasons.length === 0,
    blockingReasons,
  };
}

/** Server-authoritative discount (PHP integer). */
export function computeStoreCouponDiscountPhp(
  campaign: Pick<StoreCouponCampaignRow, "discountType" | "discountValue">,
  itemGrossPhp: number
): number {
  const gross = Math.max(0, Math.floor(itemGrossPhp));
  if (gross <= 0) return 0;
  if (!isStoreCouponDiscountType(campaign.discountType)) return 0;
  if (!(campaign.discountValue > 0) || !Number.isFinite(campaign.discountValue)) return 0;
  if (campaign.discountType === "percent") {
    const pct = Math.min(100, Math.max(0, campaign.discountValue));
    return Math.min(gross, Math.floor((gross * pct) / 100));
  }
  return Math.min(gross, Math.floor(campaign.discountValue));
}

export function resolveStoreCouponEligibility(
  input: ResolveStoreCouponEligibilityInput
): StoreCouponEligibilityState {
  const { campaign } = input;
  const nowMs = input.nowMs ?? Date.now();
  const expectedStoreId = input.expectedStoreId?.trim() || null;
  const storeMatched =
    expectedStoreId == null ? true : campaign.storeId === expectedStoreId;

  let minOrderMet = true;
  if (input.itemGrossPhp != null && Number.isFinite(input.itemGrossPhp)) {
    const minOrder =
      campaign.minOrderAmount != null && Number.isFinite(campaign.minOrderAmount)
        ? Math.floor(campaign.minOrderAmount)
        : null;
    const gross = Math.floor(input.itemGrossPhp);
    minOrderMet = minOrder == null || minOrder <= 0 || gross >= minOrder;
  }

  const notAlreadyRedeemed =
    input.alreadyRedeemed == null ? true : input.alreadyRedeemed === false;

  const discountComputable =
    isStoreCouponDiscountType(campaign.discountType) &&
    Number.isFinite(campaign.discountValue) &&
    campaign.discountValue > 0;

  return deriveStoreCouponEligibilityState({
    campaignActive: campaign.isActive === true,
    windowActive: windowActive(campaign, nowMs),
    storeMatched,
    minOrderMet,
    notAlreadyRedeemed,
    discountComputable,
  });
}

/**
 * Discovery-visible campaigns: active + window + computable discount.
 * Does not evaluate min-order / redemption (checkout adds those with same resolver).
 */
export function selectDiscoveryEligibleStoreCoupons(input: {
  campaigns: readonly StoreCouponCampaignRow[];
  nowMs?: number;
  /** Optional store scope — keep campaigns whose storeId ∈ set */
  storeIds?: ReadonlySet<string> | null;
}): StoreCouponCampaignRow[] {
  const nowMs = input.nowMs ?? Date.now();
  const out: StoreCouponCampaignRow[] = [];
  for (const campaign of input.campaigns) {
    if (input.storeIds != null && !input.storeIds.has(campaign.storeId)) continue;
    const state = resolveStoreCouponEligibility({ campaign, nowMs });
    if (state.eligible) out.push(campaign);
  }
  return out;
}

/** Convenience — same active+window check used historically, via ONE eligibility. */
export function isStoreCouponDiscoveryEligible(
  campaign: StoreCouponCampaignRow,
  nowMs: number = Date.now()
): boolean {
  return resolveStoreCouponEligibility({ campaign, nowMs }).eligible;
}

/**
 * Surface display permission only — NOT campaign eligibility.
 * HOME shelf coupon_integration / BROWSE coupon_enabled → couponBadgeAllowed.
 */
export function resolveCouponBadgeAllowed(input: {
  /** HOME: shelf coupon_integration; off = false */
  couponIntegration?: string | null;
  /** BROWSE: scope coupon_enabled */
  browseCouponEnabled?: boolean | null;
}): boolean {
  if (input.browseCouponEnabled === true) return true;
  if (input.browseCouponEnabled === false) return false;
  const integration = String(input.couponIntegration ?? "off").trim();
  return integration !== "" && integration !== "off";
}

/** @deprecated Prefer resolveStoreCouponEligibility — kept for call-site clarity. */
export function isStoreCouponCampaignActiveViaEligibility(
  row: StoreCouponCampaignRow,
  nowMs: number = Date.now()
): boolean {
  return isStoreCouponCampaignActive(row, nowMs);
}
