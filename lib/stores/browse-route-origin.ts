import { parseFiniteLatitude, parseFiniteLongitude } from "@/lib/geo/parse-finite-geographic-coord";

/** GET /api/stores/browse - no server auth; client sends user_lat/user_lng only */
export type BrowseRouteOrigin = {
  source: "explicit_coords" | "none";
  lat: number | null;
  lng: number | null;
  /** TTL cache key: lat/lng rounded to 2 decimals (~1.1km bucket) */
  cacheGeoPart: string;
};

function roundCoordForCache(n: number): string {
  return n.toFixed(2);
}

export function resolveBrowseRouteOrigin(searchParams: URLSearchParams): BrowseRouteOrigin {
  const lat = parseFiniteLatitude(searchParams.get("user_lat"));
  const lng = parseFiniteLongitude(searchParams.get("user_lng"));
  if (lat != null && lng != null) {
    return {
      source: "explicit_coords",
      lat,
      lng,
      cacheGeoPart: `g:${roundCoordForCache(lat)},${roundCoordForCache(lng)}`,
    };
  }
  return {
    source: "none",
    lat: null,
    lng: null,
    cacheGeoPart: "g:none",
  };
}
