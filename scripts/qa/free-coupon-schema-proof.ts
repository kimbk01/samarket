/**
 * FREE COUPON schema proof — no secret logging.
 * npx tsx --env-file=.env.local scripts/qa/free-coupon-schema-proof.ts
 */
import { createClient } from "@supabase/supabase-js";

function sb() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL?.trim();
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY?.trim();
  if (!url || !key) throw new Error("supabase_unconfigured");
  return createClient(url, key, { auth: { persistSession: false } });
}

async function main() {
  const client = sb();
  const { error: campErr, data: camp } = await client
    .from("store_coupon_campaigns")
    .select(
      "id, funding_mode, lifecycle_state, issue_limit, spend_budget_php, max_discount, first_order_scope, usage_end_at, claim_valid_days"
    )
    .limit(1);
  const { error: entErr } = await client.from("coupon_user_entitlements").select("id").limit(1);
  const { error: audErr } = await client.from("coupon_audit_events").select("id").limit(1);
  const { error: ordErr, data: ord } = await client
    .from("store_orders")
    .select("id, user_coupon_id, store_funded_amount, platform_funded_amount, commission_base_amount")
    .limit(1);
  const { error: claimErr } = await client.rpc("claim_store_coupon", {
    p_buyer_user_id: "00000000-0000-0000-0000-000000000000",
    p_campaign_id: "00000000-0000-0000-0000-000000000000",
  });
  const report = {
    campaigns_select: campErr?.message ?? "ok",
    entitlements_select: entErr?.message ?? "ok",
    audit_select: audErr?.message ?? "ok",
    orders_snapshot_select: ordErr?.message ?? "ok",
    claim_rpc: claimErr?.message ?? "ok",
    sample_has_funding: camp?.[0] ? Object.prototype.hasOwnProperty.call(camp[0], "funding_mode") : null,
    sample_order_has_commission_base: ord?.[0]
      ? Object.prototype.hasOwnProperty.call(ord[0], "commission_base_amount")
      : null,
  };
  console.log(JSON.stringify(report, null, 2));
  const missing =
    (campErr && /column|schema|does not exist/i.test(campErr.message)) ||
    (entErr && /does not exist/i.test(entErr.message)) ||
    (ordErr && /column|does not exist/i.test(ordErr.message));
  process.exit(missing ? 2 : 0);
}

void main().catch((e) => {
  console.error(String((e as Error).message ?? e));
  process.exit(1);
});
