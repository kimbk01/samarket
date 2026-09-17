/**
 * Shared loader: admin distance settings → effective policy for runtime surfaces.
 * Canonical eligibility: evaluateDeliveryServiceArea (legacy radius | V2 LGU).
 */
import type { SupabaseClient } from "@supabase/supabase-js";
import {
  DELIVERY_DISTANCE_POLICY_RUNTIME_ENABLED,
  loadDeliveryDistanceSettings,
  type DeliveryDistancePolicy,
  type DeliveryStoreDistanceOverrides,
} from "@/lib/delivery/delivery-ops-settings";
import type { DeliveryServiceabilityResult } from "@/lib/delivery/evaluate-delivery-serviceability";
import {
  evaluateDeliveryServiceArea,
  isDeliveryServiceAreaOutOfRange,
  type DeliveryServiceAreaEvaluation,
} from "@/lib/delivery/service-area/evaluate-delivery-service-area";
import { parseDeliveryServiceAreaAuthority } from "@/lib/delivery/service-area/authority";

export type DeliveryServiceabilityRuntimeContext = {
  policy: DeliveryDistancePolicy;
  overrides: DeliveryStoreDistanceOverrides;
};

export async function loadDeliveryServiceabilityRuntimeContext(
  sb: SupabaseClient
): Promise<DeliveryServiceabilityRuntimeContext> {
  const settings = await loadDeliveryDistanceSettings(sb);
  return {
    policy: {
      ...settings.policy,
      enabled: DELIVERY_DISTANCE_POLICY_RUNTIME_ENABLED && settings.policy.enabled,
    },
    overrides: settings.overrides,
  };
}

export type EvaluateStoreDeliveryServiceAreaArgs = {
  ctx: DeliveryServiceabilityRuntimeContext;
  storeId: string;
  /** Canonical `stores.delivery_radius_km` (NULL → effective 10). Regional discovery reference. */
  storeDeliveryRadiusKm: unknown;
  customerLat: unknown;
  customerLng: unknown;
  storeLat: unknown;
  storeLng: unknown;
  /** Default legacy_radius when omitted — preserves existing Production behavior. */
  authorityMode?: unknown;
  selectedLguIds?: readonly string[] | null;
  memberLguId?: string | null;
};

/**
 * ONE runtime entry for all surfaces. Defaults to legacy hard-radius when authority omitted.
 */
export function evaluateStoreDeliveryServiceArea(
  args: EvaluateStoreDeliveryServiceAreaArgs
): DeliveryServiceAreaEvaluation {
  return evaluateDeliveryServiceArea({
    policy: args.ctx.policy,
    overrides: args.ctx.overrides,
    storeId: args.storeId,
    storeDeliveryRadiusKm: args.storeDeliveryRadiusKm,
    customerLat: args.customerLat,
    customerLng: args.customerLng,
    storeLat: args.storeLat,
    storeLng: args.storeLng,
    authorityMode: args.authorityMode,
    selectedLguIds: args.selectedLguIds,
    memberLguId: args.memberLguId,
  });
}

/**
 * @deprecated Prefer evaluateStoreDeliveryServiceArea — kept as legacy-shaped adapter
 * for call sites not yet passing V2 fields (authority defaults to legacy_radius).
 */
export function evaluateStoreDeliveryServiceability(args: {
  ctx: DeliveryServiceabilityRuntimeContext;
  storeId: string;
  storeDeliveryRadiusKm: unknown;
  customerLat: unknown;
  customerLng: unknown;
  storeLat: unknown;
  storeLng: unknown;
  authorityMode?: unknown;
  selectedLguIds?: readonly string[] | null;
  memberLguId?: string | null;
}): DeliveryServiceabilityResult {
  const area = evaluateStoreDeliveryServiceArea(args);
  return {
    eligible: area.eligible,
    distanceKm: area.distanceKm,
    maxKm: area.maxKm,
    applies: area.applies,
    policySource: area.policySource,
    reason:
      area.reason === "selected_lgu"
        ? "eligible"
        : area.reason === "unselected_lgu" ||
            area.reason === "missing_lgu_identity" ||
            area.reason === "empty_selected_areas"
          ? "out_of_range"
          : (area.reason as DeliveryServiceabilityResult["reason"]),
  };
}

export { isDeliveryServiceAreaOutOfRange, parseDeliveryServiceAreaAuthority };

/** List/home sort: out-of-range / missing-store-coords sink to bottom when policy applies. */
export function serviceabilityDeprioritizeRank(
  svc: DeliveryServiceabilityResult | DeliveryServiceAreaEvaluation
): number {
  if (!svc.applies) return 0;
  if ("authorityMode" in svc) {
    return isDeliveryServiceAreaOutOfRange(svc) ? 1 : 0;
  }
  if (svc.reason === "out_of_range" || svc.reason === "missing_store_coords") return 1;
  return 0;
}
