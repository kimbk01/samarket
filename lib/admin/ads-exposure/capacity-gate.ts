/**
 * Ads Exposure capacity gate — FINAL LOCK.
 *
 * Delivery HERO (`STORES_HOME_HERO`, capacity=5):
 *   Owner apply / Admin approve / Admin Direct / schedule-period / reorder
 *   share placement + requested time-range overlap.
 *
 * Feed Banner: do NOT reuse HERO=5. Member one-current limit remains separate.
 * Store Sponsored: no Banner HERO capacity.
 */

import type { SupabaseClient } from "@supabase/supabase-js";
import {
  BANNER_CAPACITY_FULL_COPY,
  BANNER_PLACEMENT_CAPACITY_SSOT,
  bannerPlacementDefaultCapacity,
} from "@/lib/ads/banner-placement-capacity-ssot";
import type { PlacementOccupancyInput } from "@/lib/admin/ads-operator/placement-occupancy";
import { STORE_BANNER_AD_CAMPAIGN_TABLE } from "@/lib/stores/store-banner-ad-campaign-authority";

export const DELIVERY_HERO_PLACEMENT_KEY = "STORES_HOME_HERO" as const;

export const DELIVERY_HERO_CAPACITY =
  BANNER_PLACEMENT_CAPACITY_SSOT.STORES_HOME_HERO.defaultCapacity;

/**
 * Occupies HERO capacity for overlap (ACTIVE/SCHEDULED + in-flight review that holds a window).
 * Do not use presentation-only `isExposureOverlapCandidate` here — pending must block overbook.
 */
const HERO_OCCUPYING_LIFECYCLES = new Set([
  "ACTIVE",
  "SCHEDULED",
  "PENDING_REVIEW",
  "IN_REVIEW",
  "APPROVED",
  "PAUSED_ADMIN",
  "PAUSED_OWNER",
]);

function rangesOverlap(
  aStart: string | null,
  aEnd: string | null,
  bStartMs: number,
  bEndMs: number
): boolean {
  const start = aStart ? Date.parse(aStart) : Number.NEGATIVE_INFINITY;
  const end = aEnd ? Date.parse(aEnd) : Number.POSITIVE_INFINITY;
  if (aStart && !Number.isFinite(start)) return false;
  if (aEnd && !Number.isFinite(end)) return false;
  return start <= bEndMs && end >= bStartMs;
}

export type CapacityGateResult =
  | {
      ok: true;
      placementKey: string;
      capacity: number;
      overlappingCount: number;
      vacant: number;
    }
  | {
      ok: false;
      error: "capacity_full" | "invalid_schedule";
      placementKey: string;
      capacity: number;
      overlappingCount: number;
      vacant: number;
      messageKo: string;
      messageEn: string;
    };

export function isDeliveryHeroPlacement(key: string): boolean {
  return key === DELIVERY_HERO_PLACEMENT_KEY;
}

/**
 * Pure overlap check against already-loaded occupants.
 * Exclude `excludeCampaignId` when rescheduling the same campaign.
 */
export function assertHeroCapacityForWindow(input: {
  campaigns: PlacementOccupancyInput[];
  startAt: string;
  endAt: string;
  excludeCampaignId?: string | null;
  capacity?: number;
}): CapacityGateResult {
  const startMs = Date.parse(input.startAt);
  const endMs = Date.parse(input.endAt);
  if (!Number.isFinite(startMs) || !Number.isFinite(endMs) || endMs <= startMs) {
    return {
      ok: false,
      error: "invalid_schedule",
      placementKey: DELIVERY_HERO_PLACEMENT_KEY,
      capacity: input.capacity ?? DELIVERY_HERO_CAPACITY,
      overlappingCount: 0,
      vacant: 0,
      messageKo: "종료일은 시작일 이후여야 합니다.",
      messageEn: "End date must be after start date.",
    };
  }

  const cap = input.capacity ?? DELIVERY_HERO_CAPACITY;
  const pool = (input.excludeCampaignId
    ? input.campaigns.filter((c) => c.id !== input.excludeCampaignId)
    : input.campaigns
  ).filter(
    (c) =>
      c.inventoryKeys.includes(DELIVERY_HERO_PLACEMENT_KEY) &&
      HERO_OCCUPYING_LIFECYCLES.has(String(c.lifecycleStatus ?? "").toUpperCase()) &&
      rangesOverlap(c.startAt, c.endAt, startMs, endMs)
  );

  const overlappingCount = pool.length;
  const vacant = Math.max(0, cap - overlappingCount);
  if (overlappingCount >= cap) {
    return {
      ok: false,
      error: "capacity_full",
      placementKey: DELIVERY_HERO_PLACEMENT_KEY,
      capacity: cap,
      overlappingCount,
      vacant,
      messageKo: BANNER_CAPACITY_FULL_COPY.humanKo,
      messageEn: BANNER_CAPACITY_FULL_COPY.humanEn,
    };
  }

  return {
    ok: true,
    placementKey: DELIVERY_HERO_PLACEMENT_KEY,
    capacity: cap,
    overlappingCount,
    vacant,
  };
}

type BannerCampaignRow = {
  id: string;
  store_id?: string | null;
  title?: string | null;
  lifecycle_status?: string | null;
  start_at?: string | null;
  end_at?: string | null;
};

/**
 * Load HERO-occupying banner campaigns for capacity checks.
 */
export async function loadHeroOccupancyCampaigns(
  sb: SupabaseClient
): Promise<PlacementOccupancyInput[]> {
  const { data, error } = await sb
    .from(STORE_BANNER_AD_CAMPAIGN_TABLE)
    .select("id, store_id, title, lifecycle_status, start_at, end_at")
    .limit(500);
  if (error) {
    console.warn("[capacity-gate] load hero campaigns", error.message);
    return [];
  }

  const rows = (data ?? []) as BannerCampaignRow[];
  const occupying = rows.filter((r) =>
    HERO_OCCUPYING_LIFECYCLES.has(String(r.lifecycle_status ?? "").toUpperCase())
  );

  // Prefer junction inventory when present; default HERO for banner product rows.
  const ids = occupying.map((r) => r.id);
  const invByCampaign = new Map<string, string[]>();
  if (ids.length) {
    const { data: junct } = await sb
      .from("delivery_banner_campaign_inventories")
      .select("campaign_id, inventory_key")
      .in("campaign_id", ids);
    for (const j of junct ?? []) {
      const cid = String((j as { campaign_id?: string }).campaign_id ?? "");
      const key = String((j as { inventory_key?: string }).inventory_key ?? "");
      if (!cid || !key) continue;
      const list = invByCampaign.get(cid) ?? [];
      list.push(key);
      invByCampaign.set(cid, list);
    }
  }

  return occupying.map((r) => {
    const keys = invByCampaign.get(r.id);
    return {
      id: r.id,
      storeId: r.store_id ? String(r.store_id) : null,
      storeName: String(r.title ?? "").trim() || r.id.slice(0, 8),
      inventoryKeys:
        keys && keys.length > 0 ? keys : ([DELIVERY_HERO_PLACEMENT_KEY] as string[]),
      lifecycleStatus: String(r.lifecycle_status ?? ""),
      startAt: r.start_at ? String(r.start_at) : null,
      endAt: r.end_at ? String(r.end_at) : null,
      capacity: bannerPlacementDefaultCapacity(DELIVERY_HERO_PLACEMENT_KEY),
    };
  });
}

/** Server gate for HERO apply / approve / create / reschedule. */
export async function assertDeliveryHeroCapacityAvailable(
  sb: SupabaseClient,
  input: {
    startAt: string;
    endAt: string;
    excludeCampaignId?: string | null;
    inventoryKey?: string | null;
  }
): Promise<CapacityGateResult> {
  const key = String(input.inventoryKey ?? DELIVERY_HERO_PLACEMENT_KEY).trim();
  if (!isDeliveryHeroPlacement(key)) {
    // Non-HERO: no Banner HERO capacity (FUTURE hidden; SEARCH not sellable).
    return {
      ok: true,
      placementKey: key,
      capacity: 1,
      overlappingCount: 0,
      vacant: 1,
    };
  }
  const campaigns = await loadHeroOccupancyCampaigns(sb);
  return assertHeroCapacityForWindow({
    campaigns,
    startAt: input.startAt,
    endAt: input.endAt,
    excludeCampaignId: input.excludeCampaignId,
  });
}
