/**
 * HOME shelf card — coupon/ad benefit resolution (organic order preserved).
 */

import type { StoresHomeInsertionMeta } from "@/lib/stores/composition/stores-composition-home-insertion-meta";
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
  const adsByStoreId = new Map<string, StoresHomeInsertionMeta["paidAds"][number]>();
  const couponsByStoreId = new Map<string, StoresHomeInsertionMeta["coupons"][number]>();
  if (!insertions) return { adsByStoreId, couponsByStoreId };
  for (const ad of insertions.paidAds) {
    if (!adsByStoreId.has(ad.storeId)) adsByStoreId.set(ad.storeId, ad);
  }
  for (const coupon of insertions.coupons) {
    if (!couponsByStoreId.has(coupon.storeId)) couponsByStoreId.set(coupon.storeId, coupon);
  }
  return { adsByStoreId, couponsByStoreId };
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
