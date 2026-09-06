/**
 * Placement occupancy — presentation over existing campaign schedules.
 * Capacity SSOT: lib/ads/banner-placement-capacity-ssot.ts (HERO carousel pool ≠ 1).
 */
import {
  detectPlacementCollisions,
  isExposureOverlapCandidate,
  type AdsCollisionCampaignInput,
} from "@/lib/admin/ads-collision/detect-placement-collisions";
import { bannerPlacementDefaultCapacity, BANNER_CAPACITY_FULL_COPY } from "@/lib/ads/banner-placement-capacity-ssot";
import { HERO_OCCUPYING_LIFECYCLES } from "@/lib/admin/ads-exposure/capacity-gate";

export type PlacementOccupancyInput = AdsCollisionCampaignInput & {
  capacity?: number;
};

export type PlacementOccupancy = {
  placementKey: string;
  capacity: number;
  liveCount: number;
  reservedCount: number;
  vacant: number;
  occupants: Array<{
    id: string;
    storeName: string;
    lifecycleStatus: string;
    startAt: string | null;
    endAt: string | null;
  }>;
  nextVacancyAt: string | null;
  vacancyLabelKo: string;
  vacancyLabelEn: string;
};

function capacityFor(key: string, override?: number): number {
  if (typeof override === "number" && override > 0) return Math.trunc(override);
  return bannerPlacementDefaultCapacity(key);
}

/** HERO write-gate lifecycles; other placements keep exposure-only candidates. */
function occupiesPlacement(placementKey: string, lifecycleStatus: string): boolean {
  if (placementKey === "STORES_HOME_HERO") {
    return HERO_OCCUPYING_LIFECYCLES.has(String(lifecycleStatus ?? "").toUpperCase());
  }
  return isExposureOverlapCandidate(lifecycleStatus);
}

function overlapsInterval(
  startAt: string | null,
  endAt: string | null,
  windowStart: number,
  windowEnd: number
): boolean {
  const start = startAt ? Date.parse(startAt) : Number.NEGATIVE_INFINITY;
  const end = endAt ? Date.parse(endAt) : Number.POSITIVE_INFINITY;
  if (startAt && !Number.isFinite(start)) return false;
  if (endAt && !Number.isFinite(end)) return false;
  return start <= windowEnd && end >= windowStart;
}

export function computePlacementOccupancy(
  campaigns: PlacementOccupancyInput[],
  opts?: { nowMs?: number; placementKeys?: string[] }
): PlacementOccupancy[] {
  const now = opts?.nowMs ?? Date.now();
  const keys =
    opts?.placementKeys ??
    Array.from(
      new Set(
        campaigns.flatMap((c) => (c.inventoryKeys.length ? c.inventoryKeys : [])).filter(Boolean)
      )
    );

  const out: PlacementOccupancy[] = [];
  for (const placementKey of keys) {
    const cap = capacityFor(
      placementKey,
      campaigns.find((c) => c.inventoryKeys.includes(placementKey))?.capacity
    );
    const related = campaigns.filter(
      (c) => c.inventoryKeys.includes(placementKey) && occupiesPlacement(placementKey, c.lifecycleStatus)
    );

    const reserved = related.filter((c) => {
      const life = c.lifecycleStatus.toUpperCase();
      const start = c.startAt ? Date.parse(c.startAt) : 0;
      return life === "SCHEDULED" || (life === "ACTIVE" && Number.isFinite(start) && start > now);
    });

    const overlappingNow = related.filter((c) => overlapsInterval(c.startAt, c.endAt, now, now));
    const liveCount = overlappingNow.length;
    const vacant = Math.max(0, cap - liveCount);

    let nextVacancyAt: string | null = null;
    if (vacant <= 0) {
      const ends = overlappingNow
        .map((c) => (c.endAt ? Date.parse(c.endAt) : NaN))
        .filter((t) => Number.isFinite(t) && t > now)
        .sort((a, b) => a - b);
      if (ends[0]) nextVacancyAt = new Date(ends[0]!).toISOString();
    }

    out.push({
      placementKey,
      capacity: cap,
      liveCount,
      reservedCount: reserved.length,
      vacant,
      occupants: overlappingNow.map((c) => ({
        id: c.id,
        storeName: c.storeName || c.title || c.id.slice(0, 8),
        lifecycleStatus: c.lifecycleStatus,
        startAt: c.startAt,
        endAt: c.endAt,
      })),
      nextVacancyAt,
      vacancyLabelKo:
        vacant > 0
          ? "지금 가능"
          : nextVacancyAt
            ? new Date(nextVacancyAt).toLocaleString("ko-KR")
            : "빈 자리 없음",
      vacancyLabelEn:
        vacant > 0
          ? "Available now"
          : nextVacancyAt
            ? new Date(nextVacancyAt).toLocaleString("en-US")
            : "No vacancy",
    });
  }
  return out.sort((a, b) => a.placementKey.localeCompare(b.placementKey));
}

/** Count how many exposure candidates overlap a proposed [start,end] on a placement. */
export function countPlacementOverlapInWindow(
  campaigns: PlacementOccupancyInput[],
  input: { placementKey: string; startAt: string; endAt: string; capacity?: number }
): {
  capacity: number;
  overlappingCount: number;
  vacant: number;
  full: boolean;
  messageKo: string;
  messageEn: string;
} {
  const cap = capacityFor(input.placementKey, input.capacity);
  const startMs = Date.parse(input.startAt);
  const endMs = Date.parse(input.endAt);
  const related = campaigns.filter(
    (c) =>
      c.inventoryKeys.includes(input.placementKey) &&
      occupiesPlacement(input.placementKey, c.lifecycleStatus) &&
      overlapsInterval(c.startAt, c.endAt, startMs, endMs)
  );
  const overlappingCount = related.length;
  const vacant = Math.max(0, cap - overlappingCount);
  const full = overlappingCount >= cap;
  return {
    capacity: cap,
    overlappingCount,
    vacant,
    full,
    messageKo: full
      ? BANNER_CAPACITY_FULL_COPY.humanKo
      : `빈 슬롯 ${vacant}`,
    messageEn: full
      ? BANNER_CAPACITY_FULL_COPY.humanEn
      : `${vacant} open slot(s)`,
  };
}

export function collisionsForCampaigns(campaigns: AdsCollisionCampaignInput[]) {
  return detectPlacementCollisions(campaigns);
}
