/**
 * Server-only: listing distance = haversine(browse LGU centroid, listing LGU centroid).
 * Listing LGU = trade_lgu_id, else legacy region/city → national map.
 * Meet-spot lat/lng is NOT feed sort authority. Do not ORDER BY city.
 */
import { haversineKm } from "@/lib/geo/haversine-km";
import { resolveTradeLguUrlTokenToCanonical } from "@/lib/trade/location/national/legacy-product-alias-canonical";
import {
  getTradeLguCentroid,
  resolveTradeBrowseCenterForCanonical,
} from "@/lib/trade/location/national/lgu-centroids";
import { resolveLocalAreaToTradeNationalLgu } from "@/lib/trade/location/national/load-national-lgu-dataset";

export const MARKETPLACE_DISTANCE_SCAN_CAP = 2000;

export type MarketplaceDistanceListing = {
  trade_lgu_id?: string | null;
  region?: string | null;
  city?: string | null;
  created_at?: string;
};

export function resolveListingLguCanonicalId(
  listing: Pick<MarketplaceDistanceListing, "trade_lgu_id" | "region" | "city">
): string | null {
  const tid = (listing.trade_lgu_id ?? "").trim();
  if (tid) {
    return resolveTradeLguUrlTokenToCanonical(tid) ?? tid;
  }
  return resolveLocalAreaToTradeNationalLgu(listing.region, listing.city)?.canonicalId ?? null;
}

export function listingLguDistanceKm(
  listing: Pick<MarketplaceDistanceListing, "trade_lgu_id" | "region" | "city">,
  centerCanonicalId: string
): number {
  const center = resolveTradeBrowseCenterForCanonical(centerCanonicalId);
  const listingId = resolveListingLguCanonicalId(listing);
  if (!center || !listingId) return Number.POSITIVE_INFINITY;
  const point = getTradeLguCentroid(listingId);
  if (!point) return Number.POSITIVE_INFINITY;
  return haversineKm(center.lat, center.lng, point.lat, point.lng) ?? Number.POSITIVE_INFINITY;
}

export function sortListingsByLguDistance<T extends MarketplaceDistanceListing>(
  rows: T[],
  centerCanonicalId: string
): T[] {
  const cid = centerCanonicalId.trim();
  if (!cid) return rows;
  return [...rows].sort((a, b) => {
    const da = listingLguDistanceKm(a, cid);
    const db = listingLguDistanceKm(b, cid);
    if (da !== db) return da - db;
    const ta = Date.parse(a.created_at ?? "") || 0;
    const tb = Date.parse(b.created_at ?? "") || 0;
    return tb - ta;
  });
}
