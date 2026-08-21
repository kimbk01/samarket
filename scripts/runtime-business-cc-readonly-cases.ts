/**
 * Read-only: find delivery ACTIVE cases (policy enabled OR store override).
 * No mutations.
 */
import { createClient } from "@supabase/supabase-js";
import { loadDeliveryServiceabilityRuntimeContext } from "../lib/delivery/load-delivery-serviceability-runtime";
import { resolveEffectiveStoreDistancePolicy } from "../lib/delivery/evaluate-delivery-serviceability";
import { resolveEffectiveStoreFeePolicy } from "../lib/stores/store-fee-policy-resolve";

function env(name: string): string {
  const v = process.env[name]?.trim() ?? "";
  if (!v) throw new Error(`missing_env:${name}`);
  return v;
}

async function main() {
  const sb = createClient(env("NEXT_PUBLIC_SUPABASE_URL"), env("SUPABASE_SERVICE_ROLE_KEY"), {
    auth: { persistSession: false },
  });
  const ctx = await loadDeliveryServiceabilityRuntimeContext(sb);
  const overrideIds = Object.keys(ctx.overrides.stores);
  const { data: stores } = await sb
    .from("stores")
    .select("id, store_name, lat, lng, delivery_available, store_category_id, store_topic_id")
    .limit(50);

  const rows = [];
  for (const s of stores ?? []) {
    const id = String(s.id);
    const eff = resolveEffectiveStoreDistancePolicy(ctx.policy, ctx.overrides, id);
    const fee = await resolveEffectiveStoreFeePolicy(sb, {
      storeId: id,
      storeCategoryId: s.store_category_id,
      storeTopicId: s.store_topic_id,
    });
    rows.push({
      id,
      name: s.store_name,
      deliveryAvailable: s.delivery_available,
      hasCoords: s.lat != null && s.lng != null,
      distancePolicyEnabled: ctx.policy.enabled,
      applies: eff.applies,
      policySource: eff.policySource,
      maxKm: eff.maxKm,
      hasStoreOverride: Boolean(ctx.overrides.stores[id]),
      feeScope: fee.scope,
      feePercent: fee.feePercent,
    });
  }

  const activeDistance = rows.filter(
    (r) => r.distancePolicyEnabled && (r.applies || r.policySource === "store_disabled")
  );
  const withOverride = rows.filter((r) => r.hasStoreOverride);
  const storeFeeOverride = rows.filter((r) => r.feeScope === "store");

  console.log(
    JSON.stringify(
      {
        ok: true,
        globalDistanceEnabled: ctx.policy.enabled,
        defaultMaxKm: ctx.policy.defaultMaxKm,
        overrideMapSize: overrideIds.length,
        sampled: rows.length,
        activeDistanceCount: activeDistance.length,
        withStoreDistanceOverride: withOverride.length,
        withStoreFeeOverride: storeFeeOverride.length,
        sampleActive: activeDistance.slice(0, 3),
        sampleOverride: withOverride.slice(0, 3),
        sampleFeeStore: storeFeeOverride.slice(0, 3),
        deliveryActiveCase:
          activeDistance.length > 0 || withOverride.length > 0
            ? "FOUND_READ"
            : "NOT_FOUND_IN_SAMPLE",
        feeStoreOverrideCase:
          storeFeeOverride.length > 0 ? "FOUND_READ" : "NOT_FOUND_IN_SAMPLE",
      },
      null,
      2
    )
  );
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
