/**
 * Runtime proof: loadBusinessControlCenterDetail against live Supabase (service role).
 * Usage: npx tsx scripts/runtime-business-control-center-proof.ts
 */
import { createClient } from "@supabase/supabase-js";
import { loadBusinessControlCenterDetail } from "../lib/admin-business/load-business-control-center-detail";

function env(name: string): string {
  const v = process.env[name]?.trim() ?? "";
  if (!v) throw new Error(`missing_env:${name}`);
  return v;
}

async function main() {
  const url = env("NEXT_PUBLIC_SUPABASE_URL");
  const key = env("SUPABASE_SERVICE_ROLE_KEY");
  const sb = createClient(url, key, { auth: { persistSession: false } });

  const { data: stores, error } = await sb
    .from("stores")
    .select("id, store_name, approval_status")
    .order("created_at", { ascending: false })
    .limit(2);

  if (error) {
    console.error("LIST_FAIL", error.message);
    process.exit(1);
  }
  if (!stores || stores.length < 2) {
    console.error("NEED_TWO_STORES", stores?.length ?? 0);
    process.exit(1);
  }

  const results = [];
  for (const s of stores) {
    const detail = await loadBusinessControlCenterDetail(sb, String(s.id));
    if (!detail.ok) {
      console.error("DETAIL_FAIL", s.id, detail);
      process.exit(1);
    }
    results.push({
      id: detail.store.id,
      name: detail.store.store_name,
      approval: detail.store.approval_status,
      ownerId: detail.owner.ownerUserId,
      categoryId: detail.store.store_category_id ?? null,
      topicId: detail.store.store_topic_id ?? null,
      feeScope: detail.fee.scope,
      feeMissing: detail.fee.missing,
      deliveryApplies: detail.delivery.applies,
      deliveryMaxKm: detail.delivery.maxKm,
      policySource: detail.delivery.policySource,
      products: detail.stats.productCount,
      reviews: detail.stats.reviewCount,
      logs: detail.logs.length,
    });
  }

  const a = results[0]!;
  const b = results[1]!;
  if (a.id === b.id) {
    console.error("SAME_ID");
    process.exit(1);
  }

  console.log(
    JSON.stringify(
      {
        ok: true,
        case1: a,
        case2: b,
        switchDistinct: a.id !== b.id && a.name !== b.name,
        feeSsot: "resolveEffectiveStoreFeePolicy",
        deliverySsot: "resolveEffectiveStoreDistancePolicy + loadDeliveryServiceabilityRuntimeContext",
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
