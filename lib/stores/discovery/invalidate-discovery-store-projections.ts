import type { SupabaseClient } from "@supabase/supabase-js";
import { beginDeliveryCoverageGlobalRebuild } from "@/lib/stores/discovery/begin-delivery-coverage-global-rebuild";
import { rebuildStoreDeliveryCoverageForStore } from "@/lib/stores/discovery/persist-store-delivery-coverage";
import { refreshDiscoveryScheduleProjectionForStoreId } from "@/lib/stores/discovery/persist-discovery-schedule-projection";

export type DiscoveryStoreProjectionInvalidationReason =
  | "store_geo"
  | "store_delivery_flags"
  | "store_schedule"
  | "store_distance_override";

export type InvalidateDiscoveryStoreProjectionsOpts = {
  reasons: readonly DiscoveryStoreProjectionInvalidationReason[];
  bumpStorePolicyVersion?: boolean;
};

async function bumpStoreDeliveryPolicyVersion(sb: SupabaseClient, storeId: string): Promise<number> {
  const { data } = await sb
    .from("stores")
    .select("delivery_policy_version")
    .eq("id", storeId)
    .maybeSingle();
  const next = Math.max(1, Math.floor(Number(data?.delivery_policy_version) || 1) + 1);
  await sb.from("stores").update({ delivery_policy_version: next }).eq("id", storeId);
  return next;
}

/** Per-store projection refresh — failures are logged; no full-scan fallback. */
export async function invalidateDiscoveryStoreProjections(
  sb: SupabaseClient,
  storeId: string,
  opts: InvalidateDiscoveryStoreProjectionsOpts
): Promise<void> {
  const sid = storeId.trim();
  if (!sid) return;

  const reasons = new Set(opts.reasons);
  let storePolicyVersion: number | undefined;

  if (
    opts.bumpStorePolicyVersion !== false &&
    (reasons.has("store_geo") ||
      reasons.has("store_delivery_flags") ||
      reasons.has("store_distance_override"))
  ) {
    storePolicyVersion = await bumpStoreDeliveryPolicyVersion(sb, sid);
  }

  if (
    reasons.has("store_geo") ||
    reasons.has("store_delivery_flags") ||
    reasons.has("store_distance_override")
  ) {
    const coverage = await rebuildStoreDeliveryCoverageForStore(sb, sid, {
      storePolicyVersion,
    });
    if (!coverage.ok) {
      console.error("[invalidateDiscoveryStoreProjections] coverage", sid, coverage.error);
    }
  }

  if (reasons.has("store_schedule") || reasons.has("store_delivery_flags")) {
    const schedule = await refreshDiscoveryScheduleProjectionForStoreId(sb, sid);
    if (!schedule.ok) {
      console.error("[invalidateDiscoveryStoreProjections] schedule", sid, schedule.error);
    }
  }
}

export async function invalidateDiscoveryGlobalDistancePolicy(
  sb: SupabaseClient
): Promise<void> {
  const started = await beginDeliveryCoverageGlobalRebuild(sb);
  if (!started) {
    console.error("[invalidateDiscoveryGlobalDistancePolicy] begin failed");
  }
}
