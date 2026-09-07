import { parseFiniteLatitude, parseFiniteLongitude } from "@/lib/geo/parse-finite-geographic-coord";

/**
 * GET /api/stores/browse — no server auth; client sends user_lat/user_lng
 * (+ optional user_address_id for cache identity only; CUT 3).
 *
 * DO NOT treat user_address_id as discovery origin authority this CUT —
 * coords still come from query; address id isolates response cache.
 */

export type BrowseRouteOrigin = {
  source: "explicit_coords" | "none";
  lat: number | null;
  lng: number | null;
  /** TTL cache key: lat/lng rounded to 2 decimals (~1.1km bucket) */
  cacheGeoPart: string;
  /** Member master address id when provided — `addr:{uuid}` | `addr:none` */
  addressId: string | null;
  cacheAddressPart: string;
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

export function resolveBrowseRouteOrigin(searchParams: URLSearchParams): BrowseRouteOrigin {
  const addressId = parseBrowseUserAddressIdParam(searchParams.get("user_address_id"));
  const cacheAddressPart = browseCacheAddressPart(addressId);
  const lat = parseFiniteLatitude(searchParams.get("user_lat"));
  const lng = parseFiniteLongitude(searchParams.get("user_lng"));
  if (lat != null && lng != null) {
    return {
      source: "explicit_coords",
      lat,
      lng,
      cacheGeoPart: `g:${roundCoordForCache(lat)},${roundCoordForCache(lng)}`,
      addressId,
      cacheAddressPart,
    };
  }
  return {
    source: "none",
    lat: null,
    lng: null,
    cacheGeoPart: "g:none",
    addressId,
    cacheAddressPart,
  };
}
