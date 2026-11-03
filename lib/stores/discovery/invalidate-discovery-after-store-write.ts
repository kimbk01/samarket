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
  if ("delivery_radius_km" in patch) reasons.add("store_delivery_radius");
  if ("delivery_service_area_authority" in patch) reasons.add("store_delivery_radius");
  if ("point_commerce_blocked" in patch) reasons.add("store_schedule");
  return [...reasons];
}

/**
 * Best-effort — projection drift is repaired by maintenance jobs, not request-path fallback.
 * 반환 Promise 는 `delivery_policy_version` 올리기(= `stores.updated_at` 갱신)까지만 기다린다 — 나머지 투영은 계속 백그라운드.
 * 사장님 저장 경로는 이 Promise 를 기다린 뒤 응답한다: 응답 뒤에 매장 행이 바뀌면 화면이 다시 읽은
 * `updated_at` 이 낡아 다음 저장이 409 `store_changed` 로 막혔다 (실기 2026-11-03 B2).
 */
export function invalidateDiscoveryAfterStoreWrite(
  sb: SupabaseClient,
  storeId: string,
  patch: Record<string, unknown>
): Promise<void> {
  const reasons = resolveDiscoveryInvalidationReasonsFromStorePatch(patch);
  if (reasons.length === 0) return Promise.resolve();
  return new Promise<void>((resolve) => {
    void invalidateDiscoveryStoreProjections(sb, storeId, {
      reasons,
      onStorePolicyVersionSettled: resolve,
    }).catch((e: unknown) => {
      console.error("[invalidateDiscoveryAfterStoreWrite]", storeId, e);
      resolve();
    });
  });
}
