/**
 * CUT 4 — Shadow adapter via Gi×Dj wave RPC (SHADOW ONLY).
 * Never used as live HOME/BROWSE response authority.
 */

import type { SupabaseClient } from "@supabase/supabase-js";
import type { StoreBrowseServerSortId } from "@/lib/stores/store-discovery-browse-sort";
import {
  rankStoreDiscoveryBrowseShadow,
  rankStoreDiscoveryHomeShadow,
  rankStoreDiscoveryHomeShadowWaves,
  fillShadowRankedViaWaves,
  createInMemoryShadowWaveFetcher,
  type StoreDiscoveryShadowRankedRow,
  type ShadowWaveTelemetry,
  SHADOW_PAGINATION_ARCHITECTURE,
} from "@/lib/stores/discovery/store-discovery-shadow-ranked";
import { STORE_DISCOVERY_EXPOSURE_BAND_SIZE } from "@/lib/stores/store-discovery-exposure";
import { STORE_HOME_FEED_RESPONSE_MAX } from "@/lib/stores/store-discovery-candidate";
import { BROWSE_STORE_FETCH_CAP, BROWSE_STORE_LIMIT } from "@/lib/stores/stores-browse-build";

export type ShadowRpcAvailability = "ok" | "unavailable" | "error";

function mapWaveRpcRow(raw: Record<string, unknown>): StoreDiscoveryShadowRankedRow {
  return {
    id: String(raw.store_id ?? raw.id ?? ""),
    slug: String(raw.slug ?? ""),
    district: raw.district == null ? null : String(raw.district),
    rating_avg: raw.rating_avg == null ? null : Number(raw.rating_avg),
    review_count: raw.review_count == null ? null : Number(raw.review_count),
    eligibilityRank: Math.max(0, Math.floor(Number(raw.eligibility_rank) || 0)),
    eligibilityState: "",
    districtTier: Math.max(0, Math.floor(Number(raw.district_tier) || 0)),
    distanceKm: raw.distance_km == null ? null : Number(raw.distance_km),
    outOfRange: raw.out_of_range === true,
    completedOrders30d: Math.max(0, Math.floor(Number(raw.completed_orders_30d) || 0)),
  };
}

function createRpcShadowWaveFetcher(
  sb: SupabaseClient,
  opts: {
    sort: StoreBrowseServerSortId | "home";
    originLat: number | null;
    originLng: number | null;
    district: string | null;
    distanceAxisEnabled: boolean;
    searchQ?: string | null;
    storeCategoryId?: string | null;
    storeTopicId?: string | null;
    wantsAllSubs?: boolean;
    orphanBusinessTypes?: string[];
  }
) {
  return async (input: {
    eligibilityRank: number;
    districtTier: number;
    limit: number;
  }): Promise<StoreDiscoveryShadowRankedRow[]> => {
    const { data, error } = await sb.rpc("get_store_discovery_shadow_wave", {
      p_eligibility_rank: input.eligibilityRank,
      p_district_tier: input.districtTier,
      p_sort: opts.sort === "home" ? "default" : opts.sort,
      p_limit: input.limit,
      p_origin_lat: opts.originLat,
      p_origin_lng: opts.originLng,
      p_district: opts.district,
      p_distance_axis_enabled: opts.distanceAxisEnabled,
      p_search_q: opts.searchQ ?? null,
      p_store_category_id: opts.storeCategoryId ?? null,
      p_store_topic_id: opts.storeTopicId ?? null,
      p_wants_all_subs: opts.wantsAllSubs ?? true,
      p_orphan_business_types: opts.orphanBusinessTypes ?? [],
    });
    if (error) throw error;
    return (Array.isArray(data) ? data : []).map((r) => mapWaveRpcRow(r as Record<string, unknown>));
  };
}

export async function loadStoreDiscoveryHomeShadowViaRpc(
  sb: SupabaseClient,
  input: {
    originLat: number | null;
    originLng: number | null;
    district: string | null;
    searchQ: string | null;
    distanceAxisEnabled: boolean;
    exposureScope: string;
    nowMs?: number;
    limit?: number;
  }
): Promise<{
  status: ShadowRpcAvailability;
  rows: StoreDiscoveryShadowRankedRow[];
  telemetry?: ShadowWaveTelemetry;
  error?: string;
}> {
  try {
    const fetchWave = createRpcShadowWaveFetcher(sb, {
      sort: "home",
      originLat: input.originLat,
      originLng: input.originLng,
      district: input.district,
      distanceAxisEnabled: input.distanceAxisEnabled,
      searchQ: input.searchQ,
    });
    const ranked = await rankStoreDiscoveryHomeShadowWaves({
      fetchWave,
      district: input.district,
      exposureScope: input.exposureScope,
      nowMs: input.nowMs,
      limit: input.limit,
    });
    return { status: "ok", rows: ranked.rows, telemetry: ranked.telemetry };
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    if (msg.includes("get_store_discovery_shadow_wave") || msg.includes("does not exist")) {
      return { status: "unavailable", rows: [] };
    }
    console.error("[loadStoreDiscoveryHomeShadowViaRpc]", msg);
    return { status: "error", rows: [], error: msg };
  }
}

export async function loadStoreDiscoveryBrowseShadowViaRpc(
  sb: SupabaseClient,
  input: {
    sort: StoreBrowseServerSortId;
    originLat: number | null;
    originLng: number | null;
    district: string | null;
    distanceAxisEnabled: boolean;
    storeCategoryId: string | null;
    storeTopicId: string | null;
    wantsAllSubs: boolean;
    orphanBusinessTypes: string[];
    page: number;
    limit: number;
    exposureScope?: string;
    nowMs?: number;
  }
): Promise<{
  status: ShadowRpcAvailability;
  rows: StoreDiscoveryShadowRankedRow[];
  telemetry?: ShadowWaveTelemetry;
  error?: string;
}> {
  const page = Math.max(1, Math.floor(input.page) || 1);
  const limit = Math.max(1, Math.min(BROWSE_STORE_FETCH_CAP, Math.floor(input.limit) || BROWSE_STORE_LIMIT));
  const pageEnd = page * limit;
  const pageStart = (page - 1) * limit;
  const applyExposure = input.sort === "default" && Boolean(input.exposureScope);

  try {
    const fetchWave = createRpcShadowWaveFetcher(sb, {
      sort: input.sort,
      originLat: input.originLat,
      originLng: input.originLng,
      district: input.district,
      distanceAxisEnabled: input.distanceAxisEnabled,
      storeCategoryId: input.storeCategoryId,
      storeTopicId: input.storeTopicId,
      wantsAllSubs: input.wantsAllSubs,
      orphanBusinessTypes: input.orphanBusinessTypes,
    });

    const filled = await fillShadowRankedViaWaves({
      fetchWave,
      district: input.district,
      sort: input.sort,
      exposureScope: input.exposureScope ?? null,
      applyExposure,
      targetCount: pageEnd,
      nowMs: input.nowMs,
    });

    return {
      status: "ok",
      rows: filled.rows.slice(pageStart, pageEnd),
      telemetry: filled.telemetry,
    };
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    if (msg.includes("get_store_discovery_shadow_wave") || msg.includes("does not exist")) {
      return { status: "unavailable", rows: [] };
    }
    console.error("[loadStoreDiscoveryBrowseShadowViaRpc]", msg);
    return { status: "error", rows: [], error: msg };
  }
}

export {
  rankStoreDiscoveryHomeShadow,
  rankStoreDiscoveryBrowseShadow,
  createInMemoryShadowWaveFetcher,
  SHADOW_PAGINATION_ARCHITECTURE,
  STORE_HOME_FEED_RESPONSE_MAX,
  STORE_DISCOVERY_EXPOSURE_BAND_SIZE,
};
