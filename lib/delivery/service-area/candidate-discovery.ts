/**
 * Regional LGU candidate discovery for Owner/Admin UI.
 *
 * R = Owner approximate regional reference (stores.delivery_radius_km effective)
 * S = R + 10km = candidate display envelope only — NOT customer eligibility.
 *
 * Data: platform PH LGU centroids (no polygons in repo).
 * Boundary: inclusive 0.1km discovery rounding toward inclusion (not eligibility).
 */

import { haversineKm } from "@/lib/geo/haversine-km";
import {
  getPlatformPhLguById,
  getPlatformPhLguCentroid,
  getPlatformPhLguDisplayNameById,
  matchPlatformPhLguIdsInRadius,
  resolvePlatformPhLguFromAddressFields,
} from "@/lib/geo/ph-lgu/platform-ph-lgu";
import { resolveEffectiveStoreDeliveryRadiusKm } from "@/lib/delivery/store-delivery-radius";

/** Candidate display envelope above R (km). Presentation only — not eligibility. */
export const DELIVERY_REGIONAL_CANDIDATE_SEARCH_ADDEND_KM = 10 as const;

/**
 * Discovery-only inclusive rounding (0.1 km).
 * 20.04km vs S=20 → included. Not a customer eligibility buffer.
 */
export function roundDiscoveryKmInclusive(km: number): number {
  if (!Number.isFinite(km) || km < 0) return 0;
  return Math.floor(km * 10 + 1e-9) / 10;
}

/** Canonical candidate search km: R + 10. */
export function resolveRegionalCandidateSearchKm(referenceRadiusKm: unknown): number {
  const r = resolveEffectiveStoreDeliveryRadiusKm(referenceRadiusKm);
  return roundDiscoveryKmInclusive(r + DELIVERY_REGIONAL_CANDIDATE_SEARCH_ADDEND_KM);
}

export type DeliveryServiceAreaCandidate = {
  geoIdentity: string;
  displayName: string;
  isStoreHome: boolean;
  centroidDistanceKm: number | null;
  inDiscoveryEnvelope: boolean;
};

export function resolveStoreHomeLguId(input: {
  cityMunicipality?: string | null;
  province?: string | null;
  storeLat?: number | null;
  storeLng?: number | null;
}): string | null {
  const city = (input.cityMunicipality ?? "").trim();
  if (city) {
    const res = resolvePlatformPhLguFromAddressFields({
      cityMunicipality: city,
      province: input.province ?? null,
    });
    if (res.status === "resolved" && res.canonicalId) return res.canonicalId;
  }

  const lat = input.storeLat;
  const lng = input.storeLng;
  if (lat == null || lng == null || !Number.isFinite(lat) || !Number.isFinite(lng)) {
    return null;
  }

  // Nearest-centroid fallback when structured city unresolved — discovery aid only.
  const ids = matchPlatformPhLguIdsInRadius({
    centerLat: lat,
    centerLng: lng,
    radiusKm: 80,
  });
  let bestId: string | null = null;
  let bestD = Number.POSITIVE_INFINITY;
  for (const id of ids) {
    const c = getPlatformPhLguCentroid(id);
    if (!c) continue;
    const d = haversineKm(lat, lng, c.lat, c.lng);
    if (d == null || !Number.isFinite(d)) continue;
    if (d < bestD) {
      bestD = d;
      bestId = id;
    }
  }
  if (bestId) return bestId;

  // Broader: scan via expanding envelope using match helper with large radius
  const wide = matchPlatformPhLguIdsInRadius({
    centerLat: lat,
    centerLng: lng,
    radiusKm: 500,
  });
  for (const id of wide) {
    const c = getPlatformPhLguCentroid(id);
    if (!c) continue;
    const d = haversineKm(lat, lng, c.lat, c.lng);
    if (d == null || !Number.isFinite(d)) continue;
    if (d < bestD) {
      bestD = d;
      bestId = id;
    }
  }
  return bestId;
}

function displayNameFor(id: string): string {
  return (
    getPlatformPhLguDisplayNameById(id) ||
    getPlatformPhLguById(id)?.displayName ||
    id
  );
}

/**
 * Build surrounding City/Municipality candidates for Owner UI.
 * Always includes store-own LGU when resolved (even if centroid edge would omit).
 */
export function discoverDeliveryServiceAreaCandidates(input: {
  storeLat: number;
  storeLng: number;
  referenceRadiusKm: unknown;
  storeHomeLguId?: string | null;
}): DeliveryServiceAreaCandidate[] {
  const searchKm = resolveRegionalCandidateSearchKm(input.referenceRadiusKm);
  const homeId = (input.storeHomeLguId ?? "").trim() || null;

  // Inclusive discovery: pass searchKm as-is; float noise handled by 0.1km floor on compare.
  // Expand match radius by one 0.1km tick so boundary centroids are not silently dropped.
  const matchKm = searchKm + 0.1;
  const matched = matchPlatformPhLguIdsInRadius({
    centerLat: input.storeLat,
    centerLng: input.storeLng,
    radiusKm: matchKm,
    centerCanonicalId: homeId,
  });

  const byId = new Map<string, DeliveryServiceAreaCandidate>();
  for (const id of matched) {
    const c = getPlatformPhLguCentroid(id);
    const rawD =
      c != null ? haversineKm(input.storeLat, input.storeLng, c.lat, c.lng) : null;
    const rounded =
      rawD != null && Number.isFinite(rawD) ? roundDiscoveryKmInclusive(rawD) : null;
    const inEnvelope =
      id === homeId || (rounded != null && rounded <= searchKm) || rawD == null;
    if (!inEnvelope && id !== homeId) continue;
    byId.set(id, {
      geoIdentity: id,
      displayName: displayNameFor(id),
      isStoreHome: homeId != null && id === homeId,
      centroidDistanceKm:
        rawD != null && Number.isFinite(rawD) ? Math.round(rawD * 1000) / 1000 : null,
      inDiscoveryEnvelope: true,
    });
  }

  if (homeId && !byId.has(homeId)) {
    const c = getPlatformPhLguCentroid(homeId);
    const rawD =
      c != null ? haversineKm(input.storeLat, input.storeLng, c.lat, c.lng) : null;
    byId.set(homeId, {
      geoIdentity: homeId,
      displayName: displayNameFor(homeId),
      isStoreHome: true,
      centroidDistanceKm:
        rawD != null && Number.isFinite(rawD) ? Math.round(rawD * 1000) / 1000 : null,
      inDiscoveryEnvelope: true,
    });
  }

  return [...byId.values()].sort((a, b) => {
    if (a.isStoreHome !== b.isStoreHome) return a.isStoreHome ? -1 : 1;
    const da = a.centroidDistanceKm ?? Number.POSITIVE_INFINITY;
    const db = b.centroidDistanceKm ?? Number.POSITIVE_INFINITY;
    if (da !== db) return da - db;
    return a.displayName.localeCompare(b.displayName);
  });
}
