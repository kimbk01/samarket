/**
 * CUT 4 / CUT 8 — Gi×Dj wave RPC adapter.
 * LIVE HOME/BROWSE ranking authority when STORE_DISCOVERY_RANKING_AUTHORITY ≠ old
 * (via load-store-discovery-ranked-live). Shadow-only when authority=old.
 */

import type { SupabaseClient } from "@supabase/supabase-js";
import type { StoreBrowseServerSortId } from "@/lib/stores/store-discovery-browse-sort";
import {
  rankStoreDiscoveryBrowseShadow,
  rankStoreDiscoveryHomeShadow,
  rankStoreDiscoveryHomeShadowWaves,
  fillShadowRankedViaWaves,
  createInMemoryShadowWaveFetcher,
  districtTiersToScan,
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

/**
 * 2026-11-19 — HOME 매장 탐색: Gi(0~5)×Dj 단계를 DB 함수 1번(`get_store_discovery_shadow_waves_batch`)으로 미리 받고,
 * 기존 정렬 루프(`rankStoreDiscoveryHomeShadowWaves`)가 단계마다 요청하던 크기만큼 **앞에서부터 잘라** 쓴다.
 * 같은 단계를 더 큰 limit 로 받아 앞 N개를 쓰는 것 = limit N 으로 받은 것(같은 ORDER BY · 운영 시험으로 확인).
 * 운영 실측 1요청당 단계 RPC 5.7회 → 1회. 묶음 함수가 없거나 실패하면 null → 기존 단건 호출(지금 동작).
 */
/** 묶음 함수가 운영에 없다는 응답을 받으면 이 인스턴스에서는 다시 부르지 않는다(B1 재발 방지 — 실패 호출이 쌓이지 않게) */
let homeWavesBatchMissing = false;

async function prefetchHomeShadowWavesBatch(
  sb: SupabaseClient,
  input: {
    originLat: number | null;
    originLng: number | null;
    district: string | null;
    searchQ: string | null;
    distanceAxisEnabled: boolean;
    limit: number;
  }
): Promise<Map<string, StoreDiscoveryShadowRankedRow[]> | null> {
  if (homeWavesBatchMissing) return null;
  const hasGeo = input.distanceAxisEnabled && input.originLat != null && input.originLng != null;
  const djList = districtTiersToScan(input.district, "home", hasGeo);
  const maxNeed = input.limit + (STORE_DISCOVERY_EXPOSURE_BAND_SIZE - 1);
  const ranks: number[] = [];
  const tiers: number[] = [];
  const limits: number[] = [];
  for (const gi of [0, 1, 2, 3, 4, 5]) {
    for (const dj of djList) {
      ranks.push(gi);
      tiers.push(dj);
      limits.push(maxNeed);
    }
  }
  const { data, error } = await sb.rpc("get_store_discovery_shadow_waves_batch", {
    p_eligibility_ranks: ranks,
    p_district_tiers: tiers,
    p_limits: limits,
    p_sort: "default",
    p_origin_lat: input.originLat,
    p_origin_lng: input.originLng,
    p_district: input.district,
    p_distance_axis_enabled: input.distanceAxisEnabled,
    p_search_q: input.searchQ ?? null,
    p_store_category_id: null,
    p_store_topic_id: null,
    p_wants_all_subs: true,
    p_orphan_business_types: [],
  });
  if (error) {
    const msg = String((error as { message?: string }).message ?? "");
    const code = String((error as { code?: string }).code ?? "");
    if (code === "PGRST202" || code === "42883" || msg.includes("get_store_discovery_shadow_waves_batch")) {
      homeWavesBatchMissing = true;
    }
    return null;
  }
  if (!Array.isArray(data)) return null;
  const byWave = new Map<string, StoreDiscoveryShadowRankedRow[]>();
  for (let i = 0; i < ranks.length; i++) byWave.set(`${ranks[i]}:${tiers[i]}`, []);
  for (const raw of data as Array<Record<string, unknown>>) {
    const ord = Math.floor(Number(raw.wave_ord));
    if (!Number.isFinite(ord) || ord < 0 || ord >= ranks.length) continue;
    byWave.get(`${ranks[ord]}:${tiers[ord]}`)?.push(mapWaveRpcRow(raw));
  }
  return byWave;
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
    const rpcFetchWave = createRpcShadowWaveFetcher(sb, {
      sort: "home",
      originLat: input.originLat,
      originLng: input.originLng,
      district: input.district,
      distanceAxisEnabled: input.distanceAxisEnabled,
      searchQ: input.searchQ,
    });
    const homeLimit = Math.max(1, Math.min(input.limit ?? STORE_HOME_FEED_RESPONSE_MAX, STORE_HOME_FEED_RESPONSE_MAX));
    const prefetched = await prefetchHomeShadowWavesBatch(sb, { ...input, limit: homeLimit }).catch(() => null);
    const fetchWave: typeof rpcFetchWave = prefetched
      ? async (w) => {
          const rows = prefetched.get(`${w.eligibilityRank}:${w.districtTier}`);
          return rows ? rows.slice(0, Math.max(0, w.limit)) : rpcFetchWave(w);
        }
      : rpcFetchWave;
    const ranked = await rankStoreDiscoveryHomeShadowWaves({
      fetchWave,
      district: input.district,
      exposureScope: input.exposureScope,
      nowMs: input.nowMs,
      limit: input.limit,
      hasGeo: input.distanceAxisEnabled && input.originLat != null && input.originLng != null,
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
      hasGeo: input.distanceAxisEnabled && input.originLat != null && input.originLng != null,
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
