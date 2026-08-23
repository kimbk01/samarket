import type { SupabaseClient } from "@supabase/supabase-js";
import { storeLocationPatchTouchesCoords } from "@/lib/stores/build-store-location-patch";
import {
  invalidateDiscoveryStoreProjections,
  type DiscoveryStoreProjectionInvalidationReason,
} from "@/lib/stores/discovery/invalidate-discovery-store-projections";

export function resolveDiscoveryInvalidationReasonsFromStorePatch(
  patch: Record<string, unknown>
): DiscoveryStoreProjectionInvalidationReason[] {
  const reasons = new Set<DiscoveryStoreProjectionInvalidationReason>();
  if (storeLocationPatchTouchesCoords(patch)) reasons.add("store_geo");
  if ("business_hours_json" in patch) reasons.add("store_schedule");
  if ("is_open" in patch) {
    reasons.add("store_delivery_flags");
    reasons.add("store_schedule");
  }
  if ("delivery_available" in patch) reasons.add("store_delivery_flags");
  if ("point_commerce_blocked" in patch) reasons.add("store_schedule");
  return [...reasons];
}

/** Best-effort — projection drift is repaired by maintenance jobs, not request-path fallback. */
export function invalidateDiscoveryAfterStoreWrite(
  sb: SupabaseClient,
  storeId: string,
  patch: Record<string, unknown>
): void {
  const reasons = resolveDiscoveryInvalidationReasonsFromStorePatch(patch);
  if (reasons.length === 0) return;
  void invalidateDiscoveryStoreProjections(sb, storeId, { reasons });
}
