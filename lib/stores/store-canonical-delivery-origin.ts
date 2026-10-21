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

/**
 * LOC-005 — DB trigger `stores_guard_delivery_requires_geo` raises this code (P0001) when a write would
 * leave `delivery_available = true` with NULL lat/lng. Routes map it to the same 400 as the API check.
 */
export function isStoreDeliveryGeoGuardViolation(
  err: { message?: string | null; code?: string | null } | null | undefined
): boolean {
  if (!err) return false;
  return String(err.message ?? "").includes(STORE_DELIVERY_REQUIRES_CANONICAL_GEO_ERROR);
}
