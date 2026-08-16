/**
 * LGU center points for trade browse radius matching only.
 * Server/test — do not import from client bundles (large JSON).
 *
 * Source: data/trade-national-lgu/lgu-centroids.json (GeoNames name-matched).
 * No runtime geocoding per LGU.
 */

import { readFileSync } from "node:fs";
import { join } from "node:path";
import { haversineKm } from "@/lib/geo/haversine-km";

const DATA_PATH = join(process.cwd(), "data/trade-national-lgu/lgu-centroids.json");

type CentroidsFile = {
  dataset_version: string;
  count: number;
  centroids: Record<string, { lat: number; lng: number }>;
};

let cached: {
  datasetVersion: string;
  count: number;
  entries: Array<{ canonicalId: string; lat: number; lng: number }>;
  byId: Map<string, { lat: number; lng: number }>;
} | null = null;

function loadCentroids() {
  if (cached) return cached;
  const raw = JSON.parse(readFileSync(DATA_PATH, "utf8")) as CentroidsFile;
  const byId = new Map<string, { lat: number; lng: number }>();
  const entries: Array<{ canonicalId: string; lat: number; lng: number }> = [];
  for (const [canonicalId, c] of Object.entries(raw.centroids ?? {})) {
    if (!canonicalId || !c) continue;
    const lat = Number(c.lat);
    const lng = Number(c.lng);
    if (!Number.isFinite(lat) || !Number.isFinite(lng)) continue;
    byId.set(canonicalId, { lat, lng });
    entries.push({ canonicalId, lat, lng });
  }
  cached = {
    datasetVersion: raw.dataset_version,
    count: entries.length,
    entries,
    byId,
  };
  return cached;
}

export function getTradeLguCentroidCount(): number {
  return loadCentroids().count;
}

export function getTradeLguCentroid(
  canonicalId: string
): { lat: number; lng: number } | null {
  return loadCentroids().byId.get(canonicalId.trim()) ?? null;
}

/**
 * City-grain radius match: LGU centers within radiusKm of browse center.
 * Always includes centerCanonicalId when provided (even if centroid missing).
 */
export function matchTradeLguIdsInRadius(input: {
  centerLat: number;
  centerLng: number;
  radiusKm: number;
  /** Browse city — always retained in the match set */
  centerCanonicalId?: string | null;
}): string[] {
  const { centerLat, centerLng, radiusKm } = input;
  const centerId = (input.centerCanonicalId ?? "").trim() || null;
  if (
    !Number.isFinite(centerLat) ||
    !Number.isFinite(centerLng) ||
    !Number.isFinite(radiusKm) ||
    radiusKm <= 0
  ) {
    return centerId ? [centerId] : [];
  }

  const { entries } = loadCentroids();
  const matched = new Set<string>();
  if (centerId) matched.add(centerId);

  for (const e of entries) {
    const d = haversineKm(centerLat, centerLng, e.lat, e.lng);
    if (d != null && d <= radiusKm) matched.add(e.canonicalId);
  }

  return [...matched].sort();
}

/** Resolve browse center for a city scope: prefer LGU centroid. */
export function resolveTradeBrowseCenterForCanonical(
  canonicalId: string
): { lat: number; lng: number } | null {
  return getTradeLguCentroid(canonicalId);
}
