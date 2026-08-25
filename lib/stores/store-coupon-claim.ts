import type { SupabaseClient } from "@supabase/supabase-js";

export async function claimStoreCoupon(input: {
  sb: SupabaseClient;
  buyerUserId: string;
  campaignId: string;
}): Promise<
  | { ok: true; entitlement: { id: string; campaign_id: string; reserved_php: number; expires_at: string; coupon_number: string | null } }
  | { ok: false; error: string; httpStatus: number }
> {
  const { data, error } = await input.sb.rpc("claim_store_coupon", {
    p_buyer_user_id: input.buyerUserId,
    p_campaign_id: input.campaignId,
  });
  if (error) {
    console.error("[claimStoreCoupon]", error.message);
    return { ok: false, error: "claim_failed", httpStatus: 500 };
  }
  const row = (data ?? {}) as Record<string, unknown>;
  if (row.ok === false) {
    return {
      ok: false,
      error: String(row.error ?? "claim_failed"),
      httpStatus: Math.max(400, Math.floor(Number(row.http_status) || 400)),
    };
  }
  const ent = (row.entitlement ?? {}) as Record<string, unknown>;
  const id = String(ent.id ?? "").trim();
  if (!id) return { ok: false, error: "claim_failed", httpStatus: 500 };
  return {
    ok: true,
    entitlement: {
      id,
      campaign_id: String(ent.campaign_id ?? ""),
      reserved_php: Number(ent.reserved_php ?? 0),
      expires_at: String(ent.expires_at ?? ""),
      coupon_number: ent.coupon_number == null ? null : String(ent.coupon_number),
    },
  };
}
