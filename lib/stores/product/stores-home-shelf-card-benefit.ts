/**
 * HOME shelf card — coupon benefit resolution (organic order preserved).
 * CUT 6 — coupon_integration = couponBadgeAllowed (surface permission only).
 * Campaign eligibility is resolved server-side before coupons enter homeInsertions maps.
 */

import type { StoresHomeInsertionMeta } from "@/lib/stores/composition/stores-composition-home-insertion-meta";
import type { StoreHomeFeedItem } from "@/lib/stores/store-home-feed-types";
import type {
  StoresHomeShelfAdIntegration,
  StoresHomeShelfCouponIntegration,
} from "@/lib/stores/product/stores-home-shelf-product-catalog";
import type {
  StoresHomeShelfBenefitLineMode,
  StoresHomeShelfBadgeMode,
} from "@/lib/stores/product/stores-home-shelf-product-config";
import { formatMoneyPhp } from "@/lib/utils/format";

export type StoresHomeShelfCardBenefit = {
  imageBadgeLabel: string | null;
  imageBadgeClassName: string | null;
  benefitLine: string | null;
  sponsored: boolean;
  onActivate?: () => void;
};

export type StoresHomeInsertionBenefitMaps = {
  adsByStoreId: Map<string, StoresHomeInsertionMeta["paidAds"][number]>;
  couponsByStoreId: Map<string, StoresHomeInsertionMeta["coupons"][number]>;
};

export function buildHomeInsertionBenefitMaps(
  insertions: StoresHomeInsertionMeta | undefined
): StoresHomeInsertionBenefitMaps {
  /**
   * CUT 4 — STORE_PAID_AD is rest_stores list insertion, not purpose-shelf badge authority.
   * Purpose shelves may still show coupon badges (CUT 6). Paid sponsored = restInsertion rows.
   */
  const adsByStoreId = new Map<string, StoresHomeInsertionMeta["paidAds"][number]>();
  const couponsByStoreId = new Map<string, StoresHomeInsertionMeta["coupons"][number]>();
  if (!insertions) return { adsByStoreId, couponsByStoreId };
  for (const coupon of insertions.coupons) {
    if (!couponsByStoreId.has(coupon.storeId)) couponsByStoreId.set(coupon.storeId, coupon);
  }
  return { adsByStoreId, couponsByStoreId };
}

/** Rest_stores sponsored lookup from CUT 4 restInsertion (not campaign re-calc). */
export function buildHomeRestSponsoredStoreIds(
  insertions: StoresHomeInsertionMeta | undefined
): ReadonlySet<string> {
  return new Set(insertions?.restInsertion?.sponsoredStoreIds ?? []);
}

export function orderHomeRestStoresForPaidInsertion(
  stores: readonly StoreHomeFeedItem[],
  insertions: StoresHomeInsertionMeta | undefined
): Array<{
  store: StoreHomeFeedItem;
  isSponsored: boolean;
  campaignId?: string;
  exposureToken?: string;
}> {
  const byId = new Map(stores.map((s) => [s.id, s]));
  const rows = insertions?.restInsertion?.rows;
  if (!rows?.length) {
    return stores.map((store) => ({ store, isSponsored: false }));
  }
  const out: Array<{
    store: StoreHomeFeedItem;
    isSponsored: boolean;
    campaignId?: string;
    exposureToken?: string;
  }> = [];
  const seen = new Set<string>();
  for (const row of rows) {
    const store = byId.get(row.storeId);
    if (!store || seen.has(row.storeId)) continue;
    seen.add(row.storeId);
    if (row.kind === "paid_ad") {
      out.push({
        store,
        isSponsored: true,
        campaignId: row.campaignId,
        exposureToken: row.exposureToken,
      });
    } else {
      out.push({ store, isSponsored: false });
    }
  }
  /** Ads OFF / partial plan — append any organic remainder in original order. */
  for (const store of stores) {
    if (seen.has(store.id)) continue;
    out.push({ store, isSponsored: false });
  }
  return out;
}

function couponDiscountLabel(coupon: StoresHomeInsertionMeta["coupons"][number]): string {
  return coupon.discountType === "percent"
    ? `${coupon.discountValue}%`
    : formatMoneyPhp(coupon.discountValue);
}

export function resolveHomeShelfCardBenefit(input: {
  storeId: string;
  couponIntegration: StoresHomeShelfCouponIntegration;
  adIntegration: StoresHomeShelfAdIntegration;
  badgeMode: StoresHomeShelfBadgeMode;
  benefitLineMode: StoresHomeShelfBenefitLineMode;
  maps: StoresHomeInsertionBenefitMaps;
  labels: {
    sponsored: string;
    coupon: string;
    couponDiscount: (discount: string) => string;
    couponMinOrder: (amount: string) => string;
    adHeadline: (headline: string) => string;
  };
}): StoresHomeShelfCardBenefit | undefined {
  const ad = input.maps.adsByStoreId.get(input.storeId);
  const coupon = input.maps.couponsByStoreId.get(input.storeId);
  const showAd =
    input.adIntegration !== "off" &&
    ad != null &&
    (input.badgeMode === "sponsored" || input.badgeMode === "both" || input.adIntegration === "sponsored_badge" || input.adIntegration === "both");
  const showCouponBadge =
    input.couponIntegration !== "off" &&
    coupon != null &&
    (input.badgeMode === "coupon" || input.badgeMode === "both" || input.couponIntegration === "badge_on_image" || input.couponIntegration === "both");

  let benefitLine: string | null = null;
  if (input.benefitLineMode === "campaign" && ad?.headline) {
    benefitLine = input.labels.adHeadline(ad.headline);
  } else if (
    (input.benefitLineMode === "coupon" || input.benefitLineMode === "auto") &&
    coupon &&
    (input.couponIntegration === "benefit_line" || input.couponIntegration === "both")
  ) {
    const discount = couponDiscountLabel(coupon);
    benefitLine = input.labels.couponDiscount(discount);
    if (coupon.minOrderAmount != null && coupon.minOrderAmount > 0) {
      benefitLine = `${benefitLine} · ${input.labels.couponMinOrder(formatMoneyPhp(coupon.minOrderAmount))}`;
    }
  } else if (
    (input.benefitLineMode === "auto" || input.benefitLineMode === "campaign") &&
    ad &&
    (input.adIntegration === "benefit_line" || input.adIntegration === "both")
  ) {
    benefitLine = input.labels.adHeadline(ad.headline);
  }

  if (!showAd && !showCouponBadge && !benefitLine) return undefined;

  let imageBadgeLabel: string | null = null;
  let imageBadgeClassName: string | null = null;
  if (showCouponBadge) {
    imageBadgeLabel = input.labels.coupon;
    imageBadgeClassName = "bg-signature/90 text-white";
  } else if (showAd) {
    imageBadgeLabel = input.labels.sponsored;
    imageBadgeClassName = "bg-amber-500/90 text-white";
  }

  return {
    imageBadgeLabel,
    imageBadgeClassName,
    benefitLine,
    sponsored: showAd,
  };
}
