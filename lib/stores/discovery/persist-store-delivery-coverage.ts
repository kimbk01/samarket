import type { SupabaseClient } from "@supabase/supabase-js";
import { loadDeliveryDistanceSettings } from "@/lib/delivery/delivery-ops-settings";
import {
  buildStoreDeliveryCoverageProjection,
  type StoreDeliveryCoverageBuildInput,
} from "@/lib/stores/discovery/build-store-delivery-coverage";

export async function loadActiveCoveragePolicyVersion(sb: SupabaseClient): Promise<number> {
  const { data, error } = await sb
    .from("delivery_coverage_policy_state")
    .select("active_policy_version")
    .eq("id", 1)
    .maybeSingle();
  if (error || data?.active_policy_version == null) return 1;
  const n = Number(data.active_policy_version);
  return Number.isFinite(n) && n >= 1 ? Math.floor(n) : 1;
}

export async function persistStoreDeliveryCoverageProjection(
  sb: SupabaseClient,
  built: ReturnType<typeof buildStoreDeliveryCoverageProjection>
): Promise<{ ok: true } | { ok: false; error: string }> {
  const { error } = await sb.rpc("upsert_store_delivery_coverage", {
    p_store_id: built.storeId,
    p_policy_version: built.policyVersion,
    p_store_policy_version: built.storePolicyVersion,
    p_effective_max_km: built.effectiveMaxKm,
    p_distance_applies: built.distanceApplies,
    p_covers_all: built.coversAll,
    p_delivery_mode_effective: built.deliveryModeEffective,
    p_lat: built.lat,
    p_lng: built.lng,
  });

  if (error) {
    if (!String(error.message || "").includes("upsert_store_delivery_coverage")) {
      console.error("[persistStoreDeliveryCoverageProjection]", error.message);
    }
    return { ok: false, error: error.message };
  }
  return { ok: true };
}

export type RebuildStoreDeliveryCoverageOpts = {
  policyVersion?: number;
  storePolicyVersion?: number;
};

export async function rebuildStoreDeliveryCoverageForStore(
  sb: SupabaseClient,
  storeId: string,
  opts: RebuildStoreDeliveryCoverageOpts = {}
): Promise<{ ok: true } | { ok: false; error: string }> {
  const sid = storeId.trim();
  if (!sid) return { ok: false, error: "missing_store_id" };

  const [{ data: store, error: storeErr }, distanceSettings, policyVersion] = await Promise.all([
    sb
      .from("stores")
      .select("id, lat, lng, delivery_policy_version")
      .eq("id", sid)
      .maybeSingle(),
    loadDeliveryDistanceSettings(sb),
    opts.policyVersion != null ? Promise.resolve(opts.policyVersion) : loadActiveCoveragePolicyVersion(sb),
  ]);

  if (storeErr || !store?.id) {
    return { ok: false, error: storeErr?.message ?? "store_not_found" };
  }

  const storePolicyVersion =
    opts.storePolicyVersion ??
    Math.max(1, Math.floor(Number(store.delivery_policy_version) || 1));

  const input: StoreDeliveryCoverageBuildInput = {
    storeId: sid,
    lat: store.lat,
    lng: store.lng,
    policy: distanceSettings.policy,
    overrides: distanceSettings.overrides,
    policyVersion,
    storePolicyVersion,
  };

  const built = buildStoreDeliveryCoverageProjection(input);
  return persistStoreDeliveryCoverageProjection(sb, built);
}
