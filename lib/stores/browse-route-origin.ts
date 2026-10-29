import { parseFiniteLatitude, parseFiniteLongitude } from "@/lib/geo/parse-finite-geographic-coord";
import type { StoreListDeliveryOrigin } from "@/lib/stores/store-list-delivery-origin";
import type { DeliveryListOriginSource } from "@/lib/delivery/delivery-list-oor-policy";

/**
 * GET /api/stores/browse origin for cache keys + list distance axis.
 *
 * Authority (aligned with home-feed / CUT 5):
 * - Logged-in → master routable address only (`saved_address`)
 * - Guest → optional query GPS (`explicit_coords`) for sort/display — never OOR eligibility
 *
 * `user_address_id` on the query is cache identity for guest/client; member
 * address id comes from server session master.
 */

export type BrowseRouteOrigin = {
  source: DeliveryListOriginSource;
  lat: number | null;
  lng: number | null;
  /** TTL cache key: lat/lng rounded to 2 decimals (~1.1km bucket) */
  cacheGeoPart: string;
  /** Member master address id when provided — `addr:{uuid}` | `addr:none` */
  addressId: string | null;
  cacheAddressPart: string;
  /** Platform LGU for V2 service-area eligibility (member master only). */
  canonicalLguId?: string | null;
};

function roundCoordForCache(n: number): string {
  return n.toFixed(2);
}

/** Accept only UUID-shaped ids from query (cache identity; not a join key). */
export function parseBrowseUserAddressIdParam(raw: string | null | undefined): string | null {
  const t = (raw ?? "").trim();
  if (!t) return null;
  if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(t)) {
    return null;
  }
  return t.toLowerCase();
}

export function browseCacheAddressPart(addressId: string | null | undefined): string {
  const id = (addressId ?? "").trim();
  return id ? `addr:${id}` : "addr:none";
}

/** Map home-feed delivery origin SSOT into browse cache/list origin. */
export function browseRouteOriginFromDeliveryOrigin(
  origin: StoreListDeliveryOrigin
): BrowseRouteOrigin {
  const addressId = origin.addressId?.trim() || null;
  const cacheAddressPart = browseCacheAddressPart(addressId);
  if (origin.lat != null && origin.lng != null) {
    const source =
      origin.source === "saved_address"
        ? ("saved_address" as const)
        : ("explicit_coords" as const);
    return {
      source,
      lat: origin.lat,
      lng: origin.lng,
      cacheGeoPart: `g:${roundCoordForCache(origin.lat)},${roundCoordForCache(origin.lng)}`,
      addressId,
      cacheAddressPart,
      canonicalLguId: origin.canonicalLguId ?? null,
    };
  }
  const memberNoAddress = origin.source === "member_no_address";
  return {
    source: memberNoAddress ? "member_no_address" : "none",
    lat: null,
    lng: null,
    /** 주소 없는 회원은 실제 매장이 빠진 목록 — 비로그인과 캐시를 나눈다 */
    cacheGeoPart: memberNoAddress ? "g:member-none" : "g:none",
    addressId,
    cacheAddressPart,
    canonicalLguId: origin.canonicalLguId ?? null,
  };
}

/**
 * @deprecated Prefer `browseRouteOriginFromDeliveryOrigin(resolveStoreListDeliveryOrigin(...))`.
 * Kept for cache-key unit tests that only need query parsing.
 */
export function resolveBrowseRouteOrigin(searchParams: URLSearchParams): BrowseRouteOrigin {
  const addressId = parseBrowseUserAddressIdParam(searchParams.get("user_address_id"));
  const cacheAddressPart = browseCacheAddressPart(addressId);
  const lat = parseFiniteLatitude(searchParams.get("user_lat"));
  const lng = parseFiniteLongitude(searchParams.get("user_lng"));
  if (lat != null && lng != null) {
    return {
      source: addressId ? "saved_address" : "explicit_coords",
      lat,
      lng,
      cacheGeoPart: `g:${roundCoordForCache(lat)},${roundCoordForCache(lng)}`,
      addressId,
      cacheAddressPart,
      canonicalLguId: null,
    };
  }
  return {
    source: "none",
    lat: null,
    lng: null,
    cacheGeoPart: "g:none",
    addressId,
    cacheAddressPart,
    canonicalLguId: null,
  };
}
