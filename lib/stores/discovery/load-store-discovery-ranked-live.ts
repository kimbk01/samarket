/**
 * CUT 8 — Live HOME/BROWSE ranking via NEW bounded wave authority.
 * Fail-closed: callers must not fall back to OLD full-candidate ranking on error.
 *
 * CUT 2 — After shadow wave load, v2_lgu OOR is remapped via evaluateDeliveryServiceArea
 * so ranking / exclude match card+order selected-LGU authority.
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
import {
  resolveListDistanceOutOfRange,
  shouldExcludeOutOfRangeFromNormalList,
  type DeliveryListOriginSource,
} from "@/lib/delivery/delivery-list-oor-policy";
import { logStoreDiscoveryAuthorityRuntime } from "@/lib/stores/discovery/store-discovery-ranking-authority";
import {
  resolveDiscoveryOorWithServiceAreaAuthority,
  sortDiscoveryRowsByEligibilityThenDistance,
} from "@/lib/stores/discovery/resolve-discovery-oor-with-service-area";

function buildBrowseStatusMapFromShadow(
  rows: StoreBrowseRow[],
  outOfRangeById: Map<string, boolean>
): Map<string, BrowseStoreListItem["status"]> {
  const statusById = new Map<string, BrowseStoreListItem["status"]>();
  for (const row of rows) {
    statusById.set(
      row.id,
      resolveStoreDiscoveryBrowseDisplayStatus({
        business_hours_json: row.business_hours_json,
        is_open: row.is_open,
        point_commerce_blocked: row.point_commerce_blocked,
        delivery_available: row.delivery_available,
        distanceOutOfRange: outOfRangeById.get(row.id) === true,
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
    /** Guest GPS must not mark OOR. */
    originSource?: DeliveryListOriginSource;
    /** Authenticated master address canonical LGU — required for V2 ranking OOR. */
    memberLguId?: string | null;
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

  const originSource = input.originSource ?? "none";
  const shadowOutOfRangeById = new Map<string, boolean>();
  const distById = new Map<string, number | null>();
  const completedOrders30dById = new Map<string, number>();
  for (const r of rankedLoad.rows) {
    shadowOutOfRangeById.set(
      r.id,
      resolveListDistanceOutOfRange({
        originSource,
        serviceabilityApplies: input.distanceAxisEnabled,
        reason: r.outOfRange ? "out_of_range" : "eligible",
      })
    );
    distById.set(r.id, r.distanceKm);
    completedOrders30dById.set(r.id, r.completedOrders30d);
  }

  const corrected = await resolveDiscoveryOorWithServiceAreaAuthority(sb, {
    rows: hydrate.rows as Array<{
      id: string;
      lat?: unknown;
      lng?: unknown;
      delivery_radius_km?: unknown;
      delivery_available?: unknown;
      business_hours_json?: unknown;
      is_open?: unknown;
      point_commerce_blocked?: unknown;
    }>,
    originLat: input.originLat,
    originLng: input.originLng,
    originSource,
    memberLguId: input.memberLguId ?? null,
    distanceAxisEnabled: input.distanceAxisEnabled,
    shadowOutOfRangeById,
  });

  const rows = sortDiscoveryRowsByEligibilityThenDistance(
    hydrate.rows as Array<{ id: string } & Record<string, unknown>>,
    corrected.eligibilityRankById,
    distById
  );

  logStoreDiscoveryAuthorityRuntime({
    surface: "home",
    authority: "new",
    status: "ok",
    wavesExecuted: rankedLoad.telemetry?.wavesExecuted,
    rowsReturned: rankedLoad.rows.length,
  });

  return {
    ok: true,
    rows,
    ranked: rankedLoad.rows,
    eligibilityRankById: corrected.eligibilityRankById,
    outOfRangeById: corrected.outOfRangeById,
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
    originSource?: DeliveryListOriginSource;
    memberLguId?: string | null;
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

  const originSource = input.originSource ?? "none";
  const distanceEnabled = input.distanceAxisEnabled;
  const distById = distanceEnabled
    ? new Map(rankedLoad.rows.map((r) => [r.id, r.distanceKm] as const))
    : new Map<string, number | null>();
  const shadowOutOfRangeById = new Map(
    rankedLoad.rows.map(
      (r) =>
        [
          r.id,
          resolveListDistanceOutOfRange({
            originSource,
            serviceabilityApplies: distanceEnabled,
            reason: r.outOfRange ? "out_of_range" : "eligible",
          }),
        ] as const
    )
  );

  const corrected = await resolveDiscoveryOorWithServiceAreaAuthority(sb, {
    rows: hydrate.rows,
    originLat: input.originLat,
    originLng: input.originLng,
    originSource,
    memberLguId: input.memberLguId ?? null,
    distanceAxisEnabled: distanceEnabled,
    shadowOutOfRangeById,
  });

  let rows = sortDiscoveryRowsByEligibilityThenDistance(
    hydrate.rows,
    corrected.eligibilityRankById,
    distById
  );
  if (originSource === "saved_address") {
    rows = rows.filter(
      (row) =>
        !shouldExcludeOutOfRangeFromNormalList({
          originSource,
          distanceOutOfRange: corrected.outOfRangeById.get(row.id) === true,
        })
    );
  }

  const statusById = buildBrowseStatusMapFromShadow(rows, corrected.outOfRangeById);

  logStoreDiscoveryAuthorityRuntime({
    surface: "browse",
    authority: "new",
    status: "ok",
    wavesExecuted: rankedLoad.telemetry?.wavesExecuted,
    rowsReturned: rows.length,
  });

  return {
    ok: true,
    ranked: rankedLoad.rows,
    filter: {
      rows,
      distById: distanceEnabled ? distById : null,
      statusById,
      distanceSortMs: 0,
      outOfRangeById: corrected.outOfRangeById,
    },
  };
}
