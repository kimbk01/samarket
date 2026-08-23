/**
 * CUT 8 — Live HOME/BROWSE ranking via NEW bounded wave authority.
 * Fail-closed: callers must not fall back to OLD full-candidate ranking on error.
 */

import type { SupabaseClient } from "@supabase/supabase-js";
import type { StoreBrowseServerSortId } from "@/lib/stores/store-discovery-browse-sort";
import {
  loadStoreDiscoveryBrowseShadowViaRpc,
  loadStoreDiscoveryHomeShadowViaRpc,
} from "@/lib/stores/discovery/store-discovery-shadow-adapter";
import type { StoreDiscoveryShadowRankedRow } from "@/lib/stores/discovery/store-discovery-shadow-ranked";
import {
  loadBrowseDiscoveryRowsByOrderedIds,
  loadHomeDiscoveryRowsByOrderedIds,
  STORE_HOME_FEED_RESPONSE_MAX,
} from "@/lib/stores/store-discovery-candidate";
import type { BrowseFilteredStoreRowsResult, StoreBrowseRow } from "@/lib/stores/stores-browse-build";
import type { BrowseStoreListItem } from "@/lib/stores/browse-api-types";
import { resolveStoreDiscoveryBrowseDisplayStatus } from "@/lib/stores/store-discovery-eligibility";
import { logStoreDiscoveryAuthorityRuntime } from "@/lib/stores/discovery/store-discovery-ranking-authority";

function buildBrowseStatusMapFromShadow(
  rows: StoreBrowseRow[],
  ranked: StoreDiscoveryShadowRankedRow[]
): Map<string, BrowseStoreListItem["status"]> {
  const oor = new Map(ranked.map((r) => [r.id, r.outOfRange === true]));
  const statusById = new Map<string, BrowseStoreListItem["status"]>();
  for (const row of rows) {
    statusById.set(
      row.id,
      resolveStoreDiscoveryBrowseDisplayStatus({
        business_hours_json: row.business_hours_json,
        is_open: row.is_open,
        point_commerce_blocked: row.point_commerce_blocked,
        delivery_available: row.delivery_available,
        distanceOutOfRange: oor.get(row.id) === true,
      })
    );
  }
  return statusById;
}

export async function loadHomeDiscoveryRankedForLive(
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
): Promise<
  | {
      ok: true;
      rows: Record<string, unknown>[];
      ranked: StoreDiscoveryShadowRankedRow[];
      eligibilityRankById: Map<string, number>;
      outOfRangeById: Map<string, boolean>;
      distById: Map<string, number | null>;
      completedOrders30dById: Map<string, number>;
    }
  | { ok: false; status: "unavailable" | "error"; error?: string }
> {
  const rankedLoad = await loadStoreDiscoveryHomeShadowViaRpc(sb, {
    ...input,
    limit: input.limit ?? STORE_HOME_FEED_RESPONSE_MAX,
  });

  if (rankedLoad.status !== "ok") {
    logStoreDiscoveryAuthorityRuntime({
      surface: "home",
      authority: "new",
      status: rankedLoad.status,
      error: rankedLoad.error,
    });
    return { ok: false, status: rankedLoad.status, error: rankedLoad.error };
  }

  const hydrate = await loadHomeDiscoveryRowsByOrderedIds(
    sb,
    rankedLoad.rows.map((r) => r.id)
  );
  if (hydrate.status === "error") {
    logStoreDiscoveryAuthorityRuntime({
      surface: "home",
      authority: "new",
      status: "error",
      error: "hydrate_failed",
    });
    return { ok: false, status: "error", error: "hydrate_failed" };
  }

  const eligibilityRankById = new Map<string, number>();
  const outOfRangeById = new Map<string, boolean>();
  const distById = new Map<string, number | null>();
  const completedOrders30dById = new Map<string, number>();
  for (const r of rankedLoad.rows) {
    eligibilityRankById.set(r.id, r.eligibilityRank);
    outOfRangeById.set(r.id, r.outOfRange === true);
    distById.set(r.id, r.distanceKm);
    completedOrders30dById.set(r.id, r.completedOrders30d);
  }

  logStoreDiscoveryAuthorityRuntime({
    surface: "home",
    authority: "new",
    status: "ok",
    wavesExecuted: rankedLoad.telemetry?.wavesExecuted,
    rowsReturned: rankedLoad.rows.length,
  });

  return {
    ok: true,
    rows: hydrate.rows,
    ranked: rankedLoad.rows,
    eligibilityRankById,
    outOfRangeById,
    distById,
    completedOrders30dById,
  };
}

export async function loadBrowseDiscoveryRankedForLive(
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
): Promise<
  | { ok: true; filter: BrowseFilteredStoreRowsResult; ranked: StoreDiscoveryShadowRankedRow[] }
  | { ok: false; status: "unavailable" | "error"; error?: string }
> {
  const rankedLoad = await loadStoreDiscoveryBrowseShadowViaRpc(sb, input);
  if (rankedLoad.status !== "ok") {
    logStoreDiscoveryAuthorityRuntime({
      surface: "browse",
      authority: "new",
      status: rankedLoad.status,
      error: rankedLoad.error,
    });
    return { ok: false, status: rankedLoad.status, error: rankedLoad.error };
  }

  const hydrate = await loadBrowseDiscoveryRowsByOrderedIds(
    sb,
    rankedLoad.rows.map((r) => r.id)
  );
  if (hydrate.status === "error") {
    logStoreDiscoveryAuthorityRuntime({
      surface: "browse",
      authority: "new",
      status: "error",
      error: "hydrate_failed",
    });
    return { ok: false, status: "error", error: "hydrate_failed" };
  }

  const distanceEnabled = input.distanceAxisEnabled;
  const distById = distanceEnabled
    ? new Map(rankedLoad.rows.map((r) => [r.id, r.distanceKm] as const))
    : null;
  const outOfRangeById = new Map(rankedLoad.rows.map((r) => [r.id, r.outOfRange === true] as const));
  const statusById = buildBrowseStatusMapFromShadow(hydrate.rows, rankedLoad.rows);

  logStoreDiscoveryAuthorityRuntime({
    surface: "browse",
    authority: "new",
    status: "ok",
    wavesExecuted: rankedLoad.telemetry?.wavesExecuted,
    rowsReturned: rankedLoad.rows.length,
  });

  return {
    ok: true,
    ranked: rankedLoad.rows,
    filter: {
      rows: hydrate.rows,
      distById,
      statusById,
      distanceSortMs: 0,
      outOfRangeById,
    },
  };
}
