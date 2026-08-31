/**
 * Recovery Audit P1 — Launch placement PRODUCT contract (human language).
 * Inventory keys remain internal; Owner/Admin primary UI must use these products.
 * FUTURE inventories are not sellable.
 */

import {
  ACTIVE_DELIVERY_AD_INVENTORY_KEYS,
  FUTURE_DELIVERY_AD_INVENTORY_KEYS,
  type DeliveryAdInventoryKey,
} from "@/lib/stores/advertising/delivery-ad-inventory";

/** Launch sellable store-sponsored placements (Recovery Audit). */
export const LAUNCH_STORE_PROMOTION_PLACEMENTS = [
  {
    inventoryKey: "STORES_HOME_FEED",
    productId: "home_store_list",
    ownerTitleKey: "owner_ads_launch_home_store_title",
    ownerHelpKey: "owner_ads_launch_home_store_help",
    adminTitleKey: "admin_ads_launch_home_store_title",
    miniature: "home_interleave" as const,
    taxonomyBound: false,
  },
  {
    inventoryKey: "STORES_CATEGORY_FEED",
    productId: "category_store_list",
    ownerTitleKey: "owner_ads_launch_category_store_title",
    ownerHelpKey: "owner_ads_launch_category_store_help",
    adminTitleKey: "admin_ads_launch_category_store_title",
    miniature: "category_interleave" as const,
    taxonomyBound: true,
  },
] as const;

/**
 * Launch sellable banner placements.
 * SEARCH_TOP is NOT_SELLABLE for launch (schema/runtime may remain) — see
 * `STORES_SEARCH_TOP_LAUNCH` in delivery-ad-product-recovery-contract.ts.
 */
export const LAUNCH_BANNER_PLACEMENTS = [
  {
    inventoryKey: "STORES_HOME_HERO",
    productId: "home_hero_carousel",
    ownerTitleKey: "owner_ads_launch_home_hero_title",
    ownerHelpKey: "owner_ads_launch_home_hero_help",
    adminTitleKey: "admin_ads_launch_home_hero_title",
    miniature: "home_hero_carousel" as const,
    multiAd: "carousel" as const,
    visibleAtOnce: 1,
    autoSlideMs: 5000,
    loop: true,
    dotsRequired: true,
  },
] as const;

/** Historical / compat banner product — not Owner/Admin launch-sellable. */
export const LEGACY_SEARCH_TOP_BANNER_PLACEMENT = {
  inventoryKey: "STORES_SEARCH_TOP" as const,
  productId: "search_top_single" as const,
  launchStatus: "NOT_SELLABLE" as const,
  miniature: "search_top_single" as const,
};

export type LaunchStorePromotionInventoryKey =
  (typeof LAUNCH_STORE_PROMOTION_PLACEMENTS)[number]["inventoryKey"];
export type LaunchBannerInventoryKey =
  (typeof LAUNCH_BANNER_PLACEMENTS)[number]["inventoryKey"];

export const LAUNCH_STORE_PROMOTION_INVENTORY_KEYS =
  LAUNCH_STORE_PROMOTION_PLACEMENTS.map((p) => p.inventoryKey);

export const LAUNCH_BANNER_INVENTORY_KEYS = LAUNCH_BANNER_PLACEMENTS.map(
  (p) => p.inventoryKey
);

/** Combined package option (HOME + own primary category) — commercial may price later. */
export const LAUNCH_STORE_PROMOTION_COMBO = {
  productId: "home_plus_category",
  inventoryKeys: ["STORES_HOME_FEED", "STORES_CATEGORY_FEED"] as const,
  ownerTitleKey: "owner_ads_launch_home_plus_category_title",
  ownerHelpKey: "owner_ads_launch_home_plus_category_help",
  miniature: "home_plus_category" as const,
  taxonomyBound: true,
} as const;

export type PlacementMiniatureKind =
  | "home_interleave"
  | "category_interleave"
  | "home_plus_category"
  | "home_hero_carousel"
  | "search_top_single";

export function isLaunchSellableInventoryKey(key: string): boolean {
  return (
    (LAUNCH_STORE_PROMOTION_INVENTORY_KEYS as readonly string[]).includes(key) ||
    (LAUNCH_BANNER_INVENTORY_KEYS as readonly string[]).includes(key)
  );
}

export function isFutureDeliveryAdInventoryKey(key: string): boolean {
  return (FUTURE_DELIVERY_AD_INVENTORY_KEYS as readonly string[]).includes(key);
}

/** Reject FUTURE / non-ACTIVE for Owner sellable selection. */
export function assertLaunchSellableInventory(
  key: string
): key is DeliveryAdInventoryKey {
  if (isFutureDeliveryAdInventoryKey(key)) return false;
  if (!(ACTIVE_DELIVERY_AD_INVENTORY_KEYS as readonly string[]).includes(key)) {
    return false;
  }
  return isLaunchSellableInventoryKey(key);
}

export function launchStorePromotionByInventory(
  key: string
): (typeof LAUNCH_STORE_PROMOTION_PLACEMENTS)[number] | null {
  return LAUNCH_STORE_PROMOTION_PLACEMENTS.find((p) => p.inventoryKey === key) ?? null;
}

export function launchBannerByInventory(
  key: string
): (typeof LAUNCH_BANNER_PLACEMENTS)[number] | null {
  return LAUNCH_BANNER_PLACEMENTS.find((p) => p.inventoryKey === key) ?? null;
}

/**
 * Owner category placement title uses the store's real primary category label.
 * Never lets Owner pick an unrelated category slug.
 */
export function ownerCategoryPlacementTitle(input: {
  primaryCategoryLabel: string | null | undefined;
  fallbackKo: string;
  fallbackEn: string;
  lang: "ko" | "en";
}): string {
  const label = String(input.primaryCategoryLabel ?? "").trim();
  if (label) {
    return input.lang === "en" ? `${label} store ads` : `${label} 매장 광고`;
  }
  return input.lang === "en" ? input.fallbackEn : input.fallbackKo;
}

/** 1st-level browse placement title from store taxonomy. */
export function ownerPrimaryBrowsePlacementTitle(input: {
  primaryCategoryLabel: string | null | undefined;
  lang: "ko" | "en";
}): string {
  const label = String(input.primaryCategoryLabel ?? "").trim();
  if (label) {
    return input.lang === "en" ? `${label} (1st category)` : `${label} (1차 업종)`;
  }
  return input.lang === "en" ? "1st category list" : "1차 업종 목록";
}

/** 2nd-level browse placement title from store taxonomy. */
export function ownerSecondaryBrowsePlacementTitle(input: {
  secondaryCategoryLabel: string | null | undefined;
  lang: "ko" | "en";
}): string {
  const label = String(input.secondaryCategoryLabel ?? "").trim();
  if (label) {
    return input.lang === "en" ? `${label} (2nd category)` : `${label} (2차 업종)`;
  }
  return input.lang === "en" ? "2nd category list" : "2차 업종 목록";
}

/** Primary UI must never show raw inventory keys as the main label. */
export function looksLikeInternalInventoryKey(text: string): boolean {
  return /^STORES_[A-Z0-9_]+$/.test(text.trim()) || /^STORE_[A-Z0-9_]+$/.test(text.trim());
}
