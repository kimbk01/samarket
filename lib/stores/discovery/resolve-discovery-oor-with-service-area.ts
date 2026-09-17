/**
 * CUT 2 — Align NEW discovery ranking OOR with evaluateDeliveryServiceArea.
 * Shadow/coverage radius remains for legacy_radius only; v2_lgu uses selected LGU.
 */
import type { SupabaseClient } from "@supabase/supabase-js";
import {
  loadDeliveryServiceabilityRuntimeContext,
  evaluateStoreDeliveryServiceability,
} from "@/lib/delivery/load-delivery-serviceability-runtime";
import { resolveListDistanceOutOfRange } from "@/lib/delivery/delivery-list-oor-policy";
import type { DeliveryListOriginSource } from "@/lib/delivery/delivery-list-oor-policy";
import { loadStoreServiceAreaRuntimeMap } from "@/lib/delivery/service-area/load-store-service-area-runtime-map";
import { DELIVERY_SERVICE_AREA_AUTHORITY } from "@/lib/delivery/service-area/authority";
import { resolveStoreDiscoveryEligibility } from "@/lib/stores/store-discovery-eligibility";

export type DiscoveryRowForV2Oor = {
  id: string;
  lat?: unknown;
  lng?: unknown;
  delivery_radius_km?: unknown;
  delivery_available?: unknown;
  business_hours_json?: unknown;
  is_open?: unknown;
  point_commerce_blocked?: unknown;
};

/**
 * Overwrite shadow radius OOR with dual-mode evaluator for ranking / exclude.
 * Returns corrected outOfRangeById + eligibilityRankById (and optional row order).
 */
export async function resolveDiscoveryOorWithServiceAreaAuthority(
  sb: SupabaseClient,
  input: {
    rows: DiscoveryRowForV2Oor[];
    originLat: number | null;
    originLng: number | null;
    originSource: DeliveryListOriginSource;
    memberLguId: string | null;
    distanceAxisEnabled: boolean;
    /** Shadow OOR seed (legacy path default). */
    shadowOutOfRangeById: Map<string, boolean>;
  }
): Promise<{
  outOfRangeById: Map<string, boolean>;
  eligibilityRankById: Map<string, number>;
}> {
  const outOfRangeById = new Map(input.shadowOutOfRangeById);
  const eligibilityRankById = new Map<string, number>();

  if (!input.distanceAxisEnabled || input.originLat == null || input.originLng == null) {
    for (const row of input.rows) {
      const oor = outOfRangeById.get(row.id) === true;
      eligibilityRankById.set(
        row.id,
        resolveStoreDiscoveryEligibility({
          business_hours_json: row.business_hours_json,
          is_open: row.is_open == null ? null : Boolean(row.is_open),
          point_commerce_blocked:
            row.point_commerce_blocked == null ? null : Boolean(row.point_commerce_blocked),
          delivery_available: row.delivery_available === true,
          distanceOutOfRange: oor,
        }).rank
      );
    }
    return { outOfRangeById, eligibilityRankById };
  }

  const [ctx, areaMap] = await Promise.all([
    loadDeliveryServiceabilityRuntimeContext(sb),
    loadStoreServiceAreaRuntimeMap(
      sb,
      input.rows.map((r) => r.id)
    ),
  ]);

  for (const row of input.rows) {
    const area = areaMap.get(row.id);
    const authorityMode = area?.authorityMode ?? DELIVERY_SERVICE_AREA_AUTHORITY.LEGACY_RADIUS;
    let oor = outOfRangeById.get(row.id) === true;

    if (authorityMode === DELIVERY_SERVICE_AREA_AUTHORITY.V2_LGU) {
      const svc = evaluateStoreDeliveryServiceability({
        ctx,
        storeId: row.id,
        storeDeliveryRadiusKm: row.delivery_radius_km,
        customerLat: input.originLat,
        customerLng: input.originLng,
        storeLat: row.lat,
        storeLng: row.lng,
        authorityMode,
        selectedLguIds: area?.selectedLguIds ?? [],
        memberLguId: input.memberLguId,
      });
      oor = resolveListDistanceOutOfRange({
        originSource: input.originSource,
        serviceabilityApplies: svc.applies,
        reason: svc.reason,
      });
      outOfRangeById.set(row.id, oor);
    }

    eligibilityRankById.set(
      row.id,
      resolveStoreDiscoveryEligibility({
        business_hours_json: row.business_hours_json,
        is_open: row.is_open == null ? null : Boolean(row.is_open),
        point_commerce_blocked:
          row.point_commerce_blocked == null ? null : Boolean(row.point_commerce_blocked),
        delivery_available: row.delivery_available === true,
        distanceOutOfRange: oor,
      }).rank
    );
  }

  return { outOfRangeById, eligibilityRankById };
}

/** Stable sort: eligibility rank ASC, then distance ASC (nulls last), then id. */
export function sortDiscoveryRowsByEligibilityThenDistance<T extends { id: string }>(
  rows: T[],
  eligibilityRankById: Map<string, number>,
  distById: Map<string, number | null>
): T[] {
  return [...rows].sort((a, b) => {
    const ra = eligibilityRankById.get(a.id) ?? 99;
    const rb = eligibilityRankById.get(b.id) ?? 99;
    if (ra !== rb) return ra - rb;
    const da = distById.get(a.id);
    const db = distById.get(b.id);
    const na = da == null || !Number.isFinite(da);
    const nb = db == null || !Number.isFinite(db);
    if (na !== nb) return na ? 1 : -1;
    if (!na && !nb && da !== db) return (da as number) - (db as number);
    return a.id.localeCompare(b.id);
  });
}
