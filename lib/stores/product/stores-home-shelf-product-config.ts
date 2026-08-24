/**
 * HOME shelf extended CMS types + show-all route keys.
 */

import { STORES_HOME_SECTION_BROWSE } from "@/lib/stores/stores-home-section-browse-hrefs";

export type StoresHomeShelfEntityType = "product" | "store" | "brand";

export type StoresHomeShelfImageSource =
  | "store_profile"
  | "representative_product"
  | "campaign_creative"
  | "brand_logo"
  | "auto";

export type StoresHomeShelfBadgeMode = "off" | "standard" | "coupon" | "sponsored" | "both";

export type StoresHomeShelfBenefitLineMode =
  | "off"
  | "delivery_discount"
  | "campaign"
  | "coupon"
  | "auto";

export type StoresHomeShelfReviewSnippetMode = "off" | "rating_only" | "rating_with_count";

export type StoresHomeShelfShowAllRouteKey =
  | "orderNow"
  | "popular"
  | "discount"
  | "topRated"
  | "nearby"
  | "recommended"
  | "allStores"
  | "none";

export type StoresHomeShelfProductConfig = {
  entityType: StoresHomeShelfEntityType;
  showAllEnabled: boolean;
  showAllLabelKo: string | null;
  showAllLabelEn: string | null;
  showAllRouteKey: StoresHomeShelfShowAllRouteKey;
  imageSource: StoresHomeShelfImageSource;
  badgeMode: StoresHomeShelfBadgeMode;
  benefitLineMode: StoresHomeShelfBenefitLineMode;
  reviewSnippetMode: StoresHomeShelfReviewSnippetMode;
};

export const STORES_HOME_SHELF_DEFAULT_PRODUCT_CONFIG: StoresHomeShelfProductConfig = {
  entityType: "store",
  showAllEnabled: false,
  showAllLabelKo: null,
  showAllLabelEn: null,
  showAllRouteKey: "none",
  imageSource: "auto",
  badgeMode: "standard",
  benefitLineMode: "auto",
  reviewSnippetMode: "rating_with_count",
};

export function resolveHomeShelfShowAllHref(routeKey: StoresHomeShelfShowAllRouteKey): string | null {
  switch (routeKey) {
    case "orderNow":
      return STORES_HOME_SECTION_BROWSE.orderNow();
    case "popular":
      return STORES_HOME_SECTION_BROWSE.popular();
    case "discount":
      return STORES_HOME_SECTION_BROWSE.discount();
    case "topRated":
      return STORES_HOME_SECTION_BROWSE.topRated();
    case "nearby":
      return STORES_HOME_SECTION_BROWSE.nearby();
    case "recommended":
      return STORES_HOME_SECTION_BROWSE.recommended();
    case "allStores":
      return STORES_HOME_SECTION_BROWSE.allStores();
    default:
      return null;
  }
}

export function mergeHomeShelfProductConfig(
  base: Partial<StoresHomeShelfProductConfig> | undefined,
  override: Partial<StoresHomeShelfProductConfig> | undefined
): StoresHomeShelfProductConfig {
  return {
    ...STORES_HOME_SHELF_DEFAULT_PRODUCT_CONFIG,
    ...base,
    ...override,
  };
}

export function parseHomeShelfProductConfig(raw: unknown): Partial<StoresHomeShelfProductConfig> {
  if (!raw || typeof raw !== "object") return {};
  const o = raw as Record<string, unknown>;
  const out: Partial<StoresHomeShelfProductConfig> = {};
  if (o.entityType === "product" || o.entityType === "store" || o.entityType === "brand") {
    out.entityType = o.entityType;
  }
  if (typeof o.showAllEnabled === "boolean") out.showAllEnabled = o.showAllEnabled;
  if (typeof o.showAllLabelKo === "string") out.showAllLabelKo = o.showAllLabelKo;
  if (typeof o.showAllLabelEn === "string") out.showAllLabelEn = o.showAllLabelEn;
  if (typeof o.showAllRouteKey === "string") {
    out.showAllRouteKey = o.showAllRouteKey as StoresHomeShelfShowAllRouteKey;
  }
  if (
    o.imageSource === "store_profile" ||
    o.imageSource === "representative_product" ||
    o.imageSource === "campaign_creative" ||
    o.imageSource === "brand_logo" ||
    o.imageSource === "auto"
  ) {
    out.imageSource = o.imageSource;
  }
  if (
    o.badgeMode === "off" ||
    o.badgeMode === "standard" ||
    o.badgeMode === "coupon" ||
    o.badgeMode === "sponsored" ||
    o.badgeMode === "both"
  ) {
    out.badgeMode = o.badgeMode;
  }
  if (
    o.benefitLineMode === "off" ||
    o.benefitLineMode === "delivery_discount" ||
    o.benefitLineMode === "campaign" ||
    o.benefitLineMode === "coupon" ||
    o.benefitLineMode === "auto"
  ) {
    out.benefitLineMode = o.benefitLineMode;
  }
  if (
    o.reviewSnippetMode === "off" ||
    o.reviewSnippetMode === "rating_only" ||
    o.reviewSnippetMode === "rating_with_count"
  ) {
    out.reviewSnippetMode = o.reviewSnippetMode;
  }
  return out;
}
