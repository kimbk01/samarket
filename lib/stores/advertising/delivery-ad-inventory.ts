/**
 * CUT B — Inventory SSOT + legacy placement mapping + surface-gate classification.
 *
 * Aspect authority lives HERE (consumed by CUT E renderer). No ios_ratio/android_ratio.
 */

import type { DeliveryAdProductKey } from "@/lib/stores/advertising/delivery-ad-product-registry";

export const DELIVERY_AD_INVENTORY_TABLE = "delivery_ad_inventories" as const;

export const DELIVERY_AD_INVENTORY_KEYS = [
  "STORES_HOME_FEED",
  "STORES_CATEGORY_FEED",
  "STORES_HOME_HERO",
  "STORES_HOME_INLINE_1",
  "STORES_CATEGORY_TOP",
  "STORES_CATEGORY_INLINE",
  "STORES_SEARCH_TOP",
  "STORE_DETAIL_RECOMMENDATION_BANNER",
] as const;
export type DeliveryAdInventoryKey = (typeof DELIVERY_AD_INVENTORY_KEYS)[number];

export type DeliveryAdRatioSource =
  | "CURRENT_RUNTIME_MEASURED"
  | "PRODUCT_DESIGN_LOCK"
  | "FUTURE";

export type DeliveryAdInventoryRuntimeStatus = "ACTIVE" | "FUTURE" | "COMPATIBILITY";

export type DeliveryAdInventorySeed = {
  key: DeliveryAdInventoryKey;
  productKind: DeliveryAdProductKey;
  surface: string;
  placementType: string;
  aspectRatioWidth: number;
  aspectRatioHeight: number;
  cropPolicy: string;
  objectPosition: string;
  allowedCreativeType: "store_card" | "banner_image";
  ratioSource: DeliveryAdRatioSource;
  runtimeStatus: DeliveryAdInventoryRuntimeStatus;
  isActive: boolean;
  notes: string;
};

/**
 * HOME HERO measured from StoresHomeHeroBanner: min-h 140 / max-h 180, container width.
 * Midpoint height 160 @ ~390px → 39:16. NOT invented 16:9.
 */
export const DELIVERY_AD_INVENTORY_SEEDS: readonly DeliveryAdInventorySeed[] = [
  {
    key: "STORES_HOME_HERO",
    productKind: "banner",
    surface: "stores_home",
    placementType: "hero",
    aspectRatioWidth: 39,
    aspectRatioHeight: 16,
    cropPolicy: "cover",
    objectPosition: "center",
    allowedCreativeType: "banner_image",
    ratioSource: "CURRENT_RUNTIME_MEASURED",
    runtimeStatus: "ACTIVE",
    isActive: true,
    notes: "StoresHomeHeroBanner min/max height shell",
  },
  {
    key: "STORES_HOME_FEED",
    productKind: "store_sponsored",
    surface: "stores_home",
    placementType: "feed_insertion",
    aspectRatioWidth: 4,
    aspectRatioHeight: 3,
    cropPolicy: "cover",
    objectPosition: "center",
    allowedCreativeType: "store_card",
    ratioSource: "CURRENT_RUNTIME_MEASURED",
    runtimeStatus: "ACTIVE",
    isActive: true,
    notes: "Organic store card anatomy (aspect-[4/3])",
  },
  {
    key: "STORES_CATEGORY_FEED",
    productKind: "store_sponsored",
    surface: "stores_browse",
    placementType: "feed_insertion",
    aspectRatioWidth: 4,
    aspectRatioHeight: 3,
    cropPolicy: "cover",
    objectPosition: "center",
    allowedCreativeType: "store_card",
    ratioSource: "CURRENT_RUNTIME_MEASURED",
    runtimeStatus: "ACTIVE",
    isActive: true,
    notes: "Browse organic card anatomy",
  },
  {
    key: "STORES_HOME_INLINE_1",
    productKind: "banner",
    surface: "stores_home",
    placementType: "inline",
    aspectRatioWidth: 2,
    aspectRatioHeight: 1,
    cropPolicy: "cover",
    objectPosition: "center",
    allowedCreativeType: "banner_image",
    ratioSource: "FUTURE",
    runtimeStatus: "FUTURE",
    isActive: false,
    notes: "No runtime consumer yet",
  },
  {
    key: "STORES_CATEGORY_TOP",
    productKind: "banner",
    surface: "stores_browse",
    placementType: "category_top",
    aspectRatioWidth: 3,
    aspectRatioHeight: 1,
    cropPolicy: "cover",
    objectPosition: "center",
    allowedCreativeType: "banner_image",
    ratioSource: "FUTURE",
    runtimeStatus: "FUTURE",
    isActive: false,
    notes: "No runtime consumer yet",
  },
  {
    key: "STORES_CATEGORY_INLINE",
    productKind: "banner",
    surface: "stores_browse",
    placementType: "inline",
    aspectRatioWidth: 2,
    aspectRatioHeight: 1,
    cropPolicy: "cover",
    objectPosition: "center",
    allowedCreativeType: "banner_image",
    ratioSource: "FUTURE",
    runtimeStatus: "FUTURE",
    isActive: false,
    notes: "No runtime consumer yet",
  },
  {
    key: "STORES_SEARCH_TOP",
    productKind: "banner",
    surface: "stores_search",
    placementType: "search_top",
    aspectRatioWidth: 3,
    aspectRatioHeight: 1,
    cropPolicy: "cover",
    objectPosition: "center",
    allowedCreativeType: "banner_image",
    ratioSource: "FUTURE",
    runtimeStatus: "FUTURE",
    isActive: false,
    notes: "CUT J",
  },
  {
    key: "STORE_DETAIL_RECOMMENDATION_BANNER",
    productKind: "banner",
    surface: "store_detail",
    placementType: "recommendation",
    aspectRatioWidth: 16,
    aspectRatioHeight: 9,
    cropPolicy: "cover",
    objectPosition: "center",
    allowedCreativeType: "banner_image",
    ratioSource: "FUTURE",
    runtimeStatus: "FUTURE",
    isActive: false,
    notes: "CUT J",
  },
] as const;

export const ACTIVE_DELIVERY_AD_INVENTORY_KEYS = DELIVERY_AD_INVENTORY_SEEDS.filter(
  (s) => s.isActive && s.runtimeStatus === "ACTIVE"
).map((s) => s.key);

export const FUTURE_DELIVERY_AD_INVENTORY_KEYS = DELIVERY_AD_INVENTORY_SEEDS.filter(
  (s) => s.runtimeStatus === "FUTURE"
).map((s) => s.key);

/** Legacy DB placement/surface → inventory key (exactly one). */
export const LEGACY_PLACEMENT_TO_INVENTORY = {
  stores_home: "STORES_HOME_FEED",
  stores_browse: "STORES_CATEGORY_FEED",
  stores_home_hero: "STORES_HOME_HERO",
} as const satisfies Record<string, DeliveryAdInventoryKey>;

export type LegacySurfaceGateKey = "ad_integration" | "ad_enabled" | "homePaidAdInsertion";

/** CUT B classification — no dual authority. */
export const LEGACY_SURFACE_GATE_CLASSIFICATION = {
  ad_integration: "COMPATIBILITY",
  ad_enabled: "COMPATIBILITY",
  homePaidAdInsertion: "COMPATIBILITY",
} as const satisfies Record<LegacySurfaceGateKey, "CANONICAL" | "COMPATIBILITY" | "DEPRECATED">;

export function inventorySeedByKey(key: DeliveryAdInventoryKey): DeliveryAdInventorySeed {
  const row = DELIVERY_AD_INVENTORY_SEEDS.find((s) => s.key === key);
  if (!row) throw new Error(`unknown_inventory:${key}`);
  return row;
}

export function isRuntimeActiveInventory(key: DeliveryAdInventoryKey): boolean {
  const seed = inventorySeedByKey(key);
  return seed.isActive === true && seed.runtimeStatus === "ACTIVE";
}

export function mapLegacyPlacementToInventory(
  legacy: keyof typeof LEGACY_PLACEMENT_TO_INVENTORY
): DeliveryAdInventoryKey {
  return LEGACY_PLACEMENT_TO_INVENTORY[legacy];
}

/** Device principle: one inventory ratio — no per-platform ratio fields. */
export const DELIVERY_AD_DEVICE_RATIO_CONTRACT = {
  surfaces: ["ios", "android_apk", "mobile_web", "tablet"] as const,
  forbiddenFields: ["ios_ratio", "android_ratio", "tablet_ratio"] as const,
  rule: "single_inventory_ratio_plus_responsive_container",
  runtimeParityCut: "E/K",
} as const;
