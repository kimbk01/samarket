/**
 * Server-only: listing distance = haversine(browse LGU centroid, listing trade_lgu_id centroid).
 * Meet-spot lat/lng is NOT feed sort authority.
 */
import { haversineKm } from "@/lib/geo/haversine-km";
import {
  getTradeLguCentroid,
  resolveTradeBrowseCenterForCanonical,
} from "@/lib/trade/location/national/lgu-centroids";

export const MARKETPLACE_DISTANCE_SCAN_CAP = 2000;

export function listingLguDistanceKm(
  listing: { trade_lgu_id?: string | null },
  centerCanonicalId: string
): number {
  const center = resolveTradeBrowseCenterForCanonical(centerCanonicalId);
  const listingId = (listing.trade_lgu_id ?? "").trim();
  if (!center || !listingId) return Number.POSITIVE_INFINITY;
  const point = getTradeLguCentroid(listingId);
  if (!point) return Number.POSITIVE_INFINITY;
  return haversineKm(center.lat, center.lng, point.lat, point.lng) ?? Number.POSITIVE_INFINITY;
}

export function sortListingsByLguDistance<T extends { trade_lgu_id?: string | null; created_at?: string }>(
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
