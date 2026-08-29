/**
 * CUT A — Delivery Ad placement vocabulary (ACTIVE vs FUTURE).
 *
 * DB enum values stay migration-free:
 *   store_paid_ad_campaigns.placement: stores_home | stores_browse
 *   store_banner_ad_campaigns.surface: stores_home_hero
 *
 * Application layer uses ActiveDeliveryAdPlacement. Future values are NOT
 * runtime-valid — do not accept them in validators/consumers until CUT J+.
 */

import type { DeliveryAdProductKind } from "@/lib/stores/advertising/delivery-ad-domain";

export const ACTIVE_DELIVERY_AD_PLACEMENTS = [
  "stores_home_feed",
  "stores_category_feed",
  "stores_home_hero",
] as const;
export type ActiveDeliveryAdPlacement = (typeof ACTIVE_DELIVERY_AD_PLACEMENTS)[number];

/** Reserved for later CUTs — never treat as runtime-valid in CUT A. */
export const FUTURE_DELIVERY_AD_PLACEMENTS = [
  "stores_search",
  "store_detail_recommendation",
] as const;
export type FutureDeliveryAdPlacement = (typeof FUTURE_DELIVERY_AD_PLACEMENTS)[number];

export type DeliveryAdPlacement = ActiveDeliveryAdPlacement | FutureDeliveryAdPlacement;

/** DB paid-ad placement string ↔ ActiveDeliveryAdPlacement */
export const STORE_PAID_AD_DB_PLACEMENT_TO_ACTIVE = {
  stores_home: "stores_home_feed",
  stores_browse: "stores_category_feed",
} as const satisfies Record<"stores_home" | "stores_browse", ActiveDeliveryAdPlacement>;

export const ACTIVE_TO_STORE_PAID_AD_DB_PLACEMENT = {
  stores_home_feed: "stores_home",
  stores_category_feed: "stores_browse",
} as const satisfies Record<
  "stores_home_feed" | "stores_category_feed",
  "stores_home" | "stores_browse"
>;

export const BANNER_AD_DB_SURFACE = "stores_home_hero" as const;

export const ACTIVE_PLACEMENT_PRODUCT: Record<ActiveDeliveryAdPlacement, DeliveryAdProductKind> = {
  stores_home_feed: "store_sponsored",
  stores_category_feed: "store_sponsored",
  stores_home_hero: "banner",
};

export function isActiveDeliveryAdPlacement(value: unknown): value is ActiveDeliveryAdPlacement {
  return (
    typeof value === "string" &&
    (ACTIVE_DELIVERY_AD_PLACEMENTS as readonly string[]).includes(value)
  );
}

export function isFutureDeliveryAdPlacement(value: unknown): value is FutureDeliveryAdPlacement {
  return (
    typeof value === "string" &&
    (FUTURE_DELIVERY_AD_PLACEMENTS as readonly string[]).includes(value)
  );
}

/** Runtime-valid only — Future placements return false. */
export function isRuntimeDeliveryAdPlacement(value: unknown): value is ActiveDeliveryAdPlacement {
  return isActiveDeliveryAdPlacement(value);
}

export function mapStorePaidAdDbPlacementToActive(
  dbPlacement: "stores_home" | "stores_browse"
): ActiveDeliveryAdPlacement {
  return STORE_PAID_AD_DB_PLACEMENT_TO_ACTIVE[dbPlacement];
}

export function mapActiveToStorePaidAdDbPlacement(
  placement: "stores_home_feed" | "stores_category_feed"
): "stores_home" | "stores_browse" {
  return ACTIVE_TO_STORE_PAID_AD_DB_PLACEMENT[placement];
}
