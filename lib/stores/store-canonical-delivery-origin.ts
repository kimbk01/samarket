import {
  parseFiniteLatitude,
  parseFiniteLongitude,
} from "@/lib/geo/parse-finite-geographic-coord";

/**
 * Canonical store origin for Delivery distance / orderability.
 * Missing either coordinate → no orderable Delivery eligibility under legacy_radius.
 */
export function storeHasCanonicalDeliveryOrigin(lat: unknown, lng: unknown): boolean {
  return parseFiniteLatitude(lat) != null && parseFiniteLongitude(lng) != null;
}

/** API / Owner / Admin — enabling delivery requires finite stores.lat+lng. */
export const STORE_DELIVERY_REQUIRES_CANONICAL_GEO_ERROR = "store_delivery_requires_canonical_geo";
