/**
 * R9 — grantStoreCouponFromEditorialEvent once via canonical claim RPC.
 * npx tsx --env-file=.env.local scripts/qa/free-coupon-r9-event-grant.ts
 */
import { createClient } from "@supabase/supabase-js";
import { grantStoreCouponFromEditorialEvent } from "@/lib/stores/store-coupon-event-grant";

const BUYER_B = "edc8c2f0-2673-4ca8-9d63-92a609d556f4";
const STORE = "19085860-52d2-4183-b033-e71fcb58bcec";
const OWNER = "f00de57c-27d1-495c-824e-e39eab3227aa";

async function main() {
  const sb = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!, {
    auth: { persistSession: false },
  });
  const start = new Date();
  const { data: camp, error } = await sb
    .from("store_coupon_campaigns")
    .insert({
      store_id: STORE,
      title: `DIBAY_QA_R9_${Date.now()}`,
      discount_type: "fixed_amount",
      discount_value: 20,
      min_order_amount: 0,
      start_at: start.toISOString(),
      end_at: new Date(Date.now() + 2 * 86400000).toISOString(),
      is_active: true,
      lifecycle_state: "active",
      funding_mode: "STORE_FUNDED",
      created_by_user_id: OWNER,
      updated_by_user_id: OWNER,
    })
    .select("id")
    .single();
  if (error || !camp?.id) {
    console.error(JSON.stringify({ ok: false, error: error?.message }));
    process.exit(2);
  }
  const granted = await grantStoreCouponFromEditorialEvent({
    sb,
    buyerUserId: BUYER_B,
    campaignId: camp.id,
  });
  if (!granted.ok) {
    console.error(JSON.stringify(granted));
    process.exit(2);
  }
  const { data: row } = await sb.from("coupon_user_entitlements").select("id, campaign_id, status").eq("id", granted.entitlement.id).maybeSingle();
  console.log(JSON.stringify({ ok: true, campaign_id: camp.id, entitlement: row, grant: granted.entitlement }));
}

void main();
