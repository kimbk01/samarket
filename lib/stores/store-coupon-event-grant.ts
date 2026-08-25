/**
 * CUT 10 — thin editorial/event → coupon grant.
 * Does not create campaigns. Grants only via claim_store_coupon RPC.
 */
import type { SupabaseClient } from "@supabase/supabase-js";
import { claimStoreCoupon } from "@/lib/stores/store-coupon-claim";

export async function grantStoreCouponFromEditorialEvent(input: {
  sb: SupabaseClient;
  buyerUserId: string;
  campaignId: string;
}) {
  return claimStoreCoupon(input);
}
