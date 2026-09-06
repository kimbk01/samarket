/**
 * Delivery HERO capacity gate — Owner LOCK.
 * STORES_HOME_HERO capacity = 5, period-overlap booking.
 * Same SSOT as Admin occupancy + runtime clamp (banner-placement-capacity-ssot).
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
 * Occupies HERO pool for overlap booking (write gate).
 * Pending review must block overbook — not presentation-only ACTIVE/SCHEDULED.
 */
export const HERO_OCCUPYING_LIFECYCLES = new Set([
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
  const pool = (
    input.excludeCampaignId
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
  owner_user_id?: string | null;
  title?: string | null;
  image_url?: string | null;
  creative_id?: string | null;
  campaign_source?: string | null;
  sort_order?: number | null;
  lifecycle_status?: string | null;
  start_at?: string | null;
  end_at?: string | null;
  surface?: string | null;
};

export type HeroOccupancyCampaign = PlacementOccupancyInput & {
  ownerUserId: string | null;
  imageUrl: string | null;
  campaignSource: string | null;
  sortOrder: number | null;
};

/**
 * Load HERO-occupying banner campaigns for capacity / occupancy / reorder.
 * Junction: delivery_banner_campaign_inventories.inventory_id → delivery_ad_inventories.key
 */
export async function loadHeroOccupancyCampaigns(
  sb: SupabaseClient
): Promise<HeroOccupancyCampaign[]> {
  const { data, error } = await sb
    .from(STORE_BANNER_AD_CAMPAIGN_TABLE)
    .select(
      "id, store_id, owner_user_id, title, image_url, creative_id, campaign_source, sort_order, lifecycle_status, start_at, end_at, surface"
    )
    .limit(500);
  if (error) {
    console.warn("[capacity-gate] load hero campaigns", error.message);
    return [];
  }

  const rows = ((data ?? []) as BannerCampaignRow[]).filter((r) =>
    HERO_OCCUPYING_LIFECYCLES.has(String(r.lifecycle_status ?? "").toUpperCase())
  );
  if (!rows.length) return [];

  const ids = rows.map((r) => r.id);
  const storeIds = [...new Set(rows.map((r) => String(r.store_id ?? "")).filter(Boolean))];
  const storeNameById = new Map<string, string>();
  if (storeIds.length) {
    const { data: stores } = await sb
      .from("stores")
      .select("id, store_name")
      .in("id", storeIds);
    for (const store of stores ?? []) {
      const row = store as { id?: string; store_name?: string | null };
      const id = String(row.id ?? "");
      const name = String(row.store_name ?? "").trim();
      if (id && name) storeNameById.set(id, name);
    }
  }
  const invByCampaign = new Map<string, string[]>();
  const { data: links } = await sb
    .from("delivery_banner_campaign_inventories")
    .select("campaign_id, inventory_id")
    .in("campaign_id", ids);
  const invIds = [
    ...new Set(
      (links ?? [])
        .map((l) => String((l as { inventory_id?: string }).inventory_id ?? ""))
        .filter(Boolean)
    ),
  ];
  const keyByInvId = new Map<string, string>();
  if (invIds.length) {
    const { data: invs } = await sb
      .from("delivery_ad_inventories")
      .select("id, key, is_active")
      .in("id", invIds);
    for (const inv of invs ?? []) {
      const row = inv as { id: string; key: string; is_active?: boolean };
      if (row.is_active === false) continue;
      keyByInvId.set(String(row.id), String(row.key));
    }
  }
  for (const link of links ?? []) {
    const cid = String((link as { campaign_id?: string }).campaign_id ?? "");
    const key = keyByInvId.get(String((link as { inventory_id?: string }).inventory_id ?? ""));
    if (!cid || !key) continue;
    const list = invByCampaign.get(cid) ?? [];
    if (!list.includes(key)) list.push(key);
    invByCampaign.set(cid, list);
  }

  const out: HeroOccupancyCampaign[] = [];
  for (const r of rows) {
    const keys = invByCampaign.get(r.id);
    const surface = String(r.surface ?? "");
    const inventoryKeys =
      keys && keys.length > 0
        ? keys
        : surface === "stores_home_hero"
          ? ([DELIVERY_HERO_PLACEMENT_KEY] as string[])
          : [];
    if (!inventoryKeys.includes(DELIVERY_HERO_PLACEMENT_KEY)) continue;
    const storeId = r.store_id ? String(r.store_id) : null;
    out.push({
      id: r.id,
      storeId,
      storeName:
        (storeId ? storeNameById.get(storeId) : null) ??
        (String(r.title ?? "").trim() || r.id.slice(0, 8)),
      title: String(r.title ?? "").trim() || null,
      inventoryKeys,
      lifecycleStatus: String(r.lifecycle_status ?? ""),
      startAt: r.start_at ? String(r.start_at) : null,
      endAt: r.end_at ? String(r.end_at) : null,
      creativeId: r.creative_id ? String(r.creative_id) : null,
      ownerUserId: r.owner_user_id ? String(r.owner_user_id) : null,
      imageUrl: String(r.image_url ?? "").trim() || null,
      campaignSource: String(r.campaign_source ?? "").trim() || null,
      sortOrder:
        typeof r.sort_order === "number" && Number.isFinite(r.sort_order)
          ? r.sort_order
          : null,
      capacity: bannerPlacementDefaultCapacity(DELIVERY_HERO_PLACEMENT_KEY),
    });
  }
  return out;
}

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
