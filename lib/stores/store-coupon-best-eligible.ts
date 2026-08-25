import type { SupabaseClient } from "@supabase/supabase-js";
import { computeCouponDiscountPhp } from "@/lib/stores/store-coupon-funding-math";

export type StoreCouponQuote = {
  userCouponId: string;
  campaignId: string;
  title: string;
  discountAmount: number;
  ineligibleReason: string | null;
};

export function pickBestEligibleCouponQuote(quotes: readonly StoreCouponQuote[]): StoreCouponQuote | null {
  const usable = quotes.filter((q) => q.discountAmount > 0 && !q.ineligibleReason);
  if (usable.length === 0) return null;
  return [...usable].sort((a, b) => {
    if (b.discountAmount !== a.discountAmount) return b.discountAmount - a.discountAmount;
    return a.userCouponId.localeCompare(b.userCouponId);
  })[0];
}

export async function quoteStoreCouponsForCheckout(input: {
  sb: SupabaseClient;
  buyerUserId: string;
  storeId: string;
  itemGrossPhp: number;
  nowMs?: number;
}): Promise<StoreCouponQuote[]> {
  const nowMs = input.nowMs ?? Date.now();
  const itemGross = Math.floor(input.itemGrossPhp);
  const { data: ents } = await input.sb
    .from("coupon_user_entitlements")
    .select(
      "id, campaign_id, status, expires_at, store_coupon_campaigns(id, store_id, title, discount_type, discount_value, min_order_amount, max_discount, lifecycle_state, is_active)"
    )
    .eq("buyer_user_id", input.buyerUserId)
    .eq("store_id", input.storeId)
    .in("status", ["available", "restored"]);
  const out: StoreCouponQuote[] = [];
  for (const raw of ents ?? []) {
    const r = raw as Record<string, unknown>;
    const campRaw = r.store_coupon_campaigns as Record<string, unknown> | Record<string, unknown>[] | null;
    const camp = Array.isArray(campRaw) ? campRaw[0] : campRaw;
    const userCouponId = String(r.id ?? "");
    const campaignId = String(r.campaign_id ?? "");
    const title = String(camp?.title ?? "");
    if (!userCouponId || !campaignId || !camp) continue;
    const expires = Date.parse(String(r.expires_at ?? ""));
    if (String(camp.store_id) !== input.storeId) {
      out.push({ userCouponId, campaignId, title, discountAmount: 0, ineligibleReason: "coupon_wrong_store" });
      continue;
    }
    if (String(camp.lifecycle_state) === "revoked") {
      out.push({ userCouponId, campaignId, title, discountAmount: 0, ineligibleReason: "COUPON_REVOKED" });
      continue;
    }
    if (Number.isFinite(expires) && expires <= nowMs) {
      out.push({ userCouponId, campaignId, title, discountAmount: 0, ineligibleReason: "coupon_expired" });
      continue;
    }
    const minOrder = camp.min_order_amount == null ? null : Number(camp.min_order_amount);
    if (minOrder != null && Number.isFinite(minOrder) && minOrder > 0 && itemGross < minOrder) {
      out.push({ userCouponId, campaignId, title, discountAmount: 0, ineligibleReason: "coupon_min_order" });
      continue;
    }
    const dtype = camp.discount_type === "percent" || camp.discount_type === "fixed_amount" ? camp.discount_type : null;
    if (!dtype) {
      out.push({ userCouponId, campaignId, title, discountAmount: 0, ineligibleReason: "invalid_discount" });
      continue;
    }
    const discountAmount = computeCouponDiscountPhp({
      discountType: dtype,
      discountValue: Number(camp.discount_value),
      itemSubtotalPhp: itemGross,
      maxDiscountPhp: camp.max_discount == null ? null : Number(camp.max_discount),
    });
    out.push({
      userCouponId,
      campaignId,
      title,
      discountAmount,
      ineligibleReason: discountAmount > 0 ? null : "invalid_discount",
    });
  }
  return out;
}
