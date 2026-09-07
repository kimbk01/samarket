/**
 * CUT 8 — Store detail / add-to-cart delivery ordering eligibility.
 *
 * Ordering CTAs (add / checkout) for local_delivery follow the same
 * canonical serviceability client as cart/checkout:
 * `fetchStoreDeliveryServiceabilityClient` → `isDeliveryDistanceOrderBlocked`.
 *
 * View / browse of store detail remains allowed when out of range.
 * Cart retain on address change remains CUT 7 RETAIN_AND_REVALIDATE.
 */

import type { StorePublicFulfillmentMode } from "@/components/stores/StoreDetailStorefrontPanel";

export function isDeliveryOrderingBlockedByServiceability(args: {
  fulfillmentMode: StorePublicFulfillmentMode | "local_delivery" | "pickup" | "shipping";
  distanceOutOfRange: boolean;
}): boolean {
  return args.fulfillmentMode === "local_delivery" && args.distanceOutOfRange === true;
}
