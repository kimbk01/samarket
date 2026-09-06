/**
 * Placement occupancy — presentation over existing campaign schedules.
 * No new capacity table.
 */
import {
  detectPlacementCollisions,
  isExposureOverlapCandidate,
  type AdsCollisionCampaignInput,
} from "@/lib/admin/ads-collision/detect-placement-collisions";

export type PlacementOccupancyInput = AdsCollisionCampaignInput & {
  capacity?: number;
};

export type PlacementOccupancy = {
  placementKey: string;
  capacity: number;
  liveCount: number;
  reservedCount: number;
  vacant: number;
  occupants: Array<{ id: string; storeName: string; lifecycleStatus: string; startAt: string | null; endAt: string | null }>;
  nextVacancyAt: string | null;
  /** now | future ISO | null if full indefinitely */
  vacancyLabelKo: string;
  vacancyLabelEn: string;
};

const DEFAULT_CAPACITY: Record<string, number> = {
  STORES_HOME_HERO: 1,
  STORES_SEARCH_TOP: 1,
  STORES_HOME_FEED: 3,
  STORES_CATEGORY_FEED: 3,
  TRADE_HOME: 3,
  COMMUNITY_HOME: 3,
};

function capacityFor(key: string, override?: number): number {
  if (typeof override === "number" && override > 0) return override;
  return DEFAULT_CAPACITY[key] ?? 1;
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
      (c) => c.inventoryKeys.includes(placementKey) && isExposureOverlapCandidate(c.lifecycleStatus)
    );
    const live = related.filter((c) => {
      const life = c.lifecycleStatus.toUpperCase();
      const start = c.startAt ? new Date(c.startAt).getTime() : 0;
      const end = c.endAt ? new Date(c.endAt).getTime() : Number.POSITIVE_INFINITY;
      return life === "ACTIVE" && start <= now && end >= now;
    });
    const reserved = related.filter((c) => {
      const life = c.lifecycleStatus.toUpperCase();
      const start = c.startAt ? new Date(c.startAt).getTime() : 0;
      return life === "SCHEDULED" || (life === "ACTIVE" && start > now);
    });
    const used = Math.min(cap, Math.max(live.length, live.length + Math.max(0, reserved.length - (cap - live.length) < 0 ? 0 : 0)));
    // Occupancy heuristic: concurrent candidates overlapping now
    const overlappingNow = related.filter((c) => {
      const start = c.startAt ? new Date(c.startAt).getTime() : Number.NEGATIVE_INFINITY;
      const end = c.endAt ? new Date(c.endAt).getTime() : Number.POSITIVE_INFINITY;
      return start <= now && end >= now;
    });
    const liveCount = Math.min(cap, overlappingNow.length);
    const vacant = Math.max(0, cap - liveCount);
    let nextVacancyAt: string | null = null;
    if (vacant > 0) {
      nextVacancyAt = null; // available now
    } else {
      const ends = overlappingNow
        .map((c) => (c.endAt ? new Date(c.endAt).getTime() : NaN))
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
        vacant > 0 ? "지금 가능" : nextVacancyAt ? new Date(nextVacancyAt).toLocaleString("ko-KR") : "빈 자리 없음",
      vacancyLabelEn:
        vacant > 0 ? "Available now" : nextVacancyAt ? new Date(nextVacancyAt).toLocaleString("en-US") : "No vacancy",
    });
  }
  return out.sort((a, b) => a.placementKey.localeCompare(b.placementKey));
}

export function collisionsForCampaigns(campaigns: AdsCollisionCampaignInput[]) {
  return detectPlacementCollisions(campaigns);
}
