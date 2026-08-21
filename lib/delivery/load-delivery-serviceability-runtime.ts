/**
 * Shared loader: admin distance settings → effective policy for runtime surfaces.
 * Serviceability itself is pure (`evaluateDeliveryServiceability`) — no Google.
 */
import type { SupabaseClient } from "@supabase/supabase-js";
import {
  DELIVERY_DISTANCE_POLICY_RUNTIME_ENABLED,
  loadDeliveryDistanceSettings,
  type DeliveryDistancePolicy,
  type DeliveryStoreDistanceOverrides,
} from "@/lib/delivery/delivery-ops-settings";
import {
  evaluateDeliveryServiceability,
  type DeliveryServiceabilityResult,
} from "@/lib/delivery/evaluate-delivery-serviceability";

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

export function evaluateStoreDeliveryServiceability(args: {
  ctx: DeliveryServiceabilityRuntimeContext;
  storeId: string;
  customerLat: unknown;
  customerLng: unknown;
  storeLat: unknown;
  storeLng: unknown;
}): DeliveryServiceabilityResult {
  return evaluateDeliveryServiceability({
    policy: args.ctx.policy,
    overrides: args.ctx.overrides,
    storeId: args.storeId,
    customerLat: args.customerLat,
    customerLng: args.customerLng,
    storeLat: args.storeLat,
    storeLng: args.storeLng,
  });
}

/** List/home sort: out-of-range / missing-store-coords sink to bottom when policy applies. */
export function serviceabilityDeprioritizeRank(svc: DeliveryServiceabilityResult): number {
  if (!svc.applies) return 0;
  if (svc.reason === "out_of_range" || svc.reason === "missing_store_coords") return 1;
  return 0;
}
