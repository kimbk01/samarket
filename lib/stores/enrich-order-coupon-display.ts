import type { SupabaseClient } from "@supabase/supabase-js";

/**
 * SSOT: buyer order UI shows Coupon Offer title + Instance number + discount.
 * Prefer order-row snapshots; else entitlement.offer_snapshot then live campaign title.
 */
export async function enrichOrderCouponDisplayFields(
  sb: SupabaseClient,
  order: Record<string, unknown>
): Promise<Record<string, unknown>> {
  const discount = Math.round(Number(order.discount_amount) || 0);
  if (discount <= 0) return order;

  const existingTitle = String(order.coupon_offer_title ?? "").trim();
  const existingNumber = String(order.coupon_number ?? "").trim();
  if (existingTitle && existingNumber) return order;

  const userCouponId = String(order.user_coupon_id ?? "").trim();
  const campaignId = String(order.coupon_campaign_id ?? "").trim();
  if (!userCouponId && !campaignId) return order;

  let title = existingTitle;
  let number = existingNumber;

  if (userCouponId) {
    let { data, error } = await sb
      .from("coupon_user_entitlements")
      .select("coupon_number, offer_snapshot, store_coupon_campaigns(title)")
      .eq("id", userCouponId)
      .maybeSingle();
    if (error && /offer_snapshot/i.test(error.message)) {
      const retry = await sb
        .from("coupon_user_entitlements")
        .select("coupon_number, store_coupon_campaigns(title)")
        .eq("id", userCouponId)
        .maybeSingle();
      data = retry.data as typeof data;
      error = retry.error;
    }
    if (!error && data) {
      if (!number && (data as { coupon_number?: string | null }).coupon_number != null) {
        number = String((data as { coupon_number?: string }).coupon_number).trim();
      }
      const snap = (data as { offer_snapshot?: unknown }).offer_snapshot;
      if (
        !title &&
        snap &&
        typeof snap === "object" &&
        !Array.isArray(snap) &&
        (snap as { title?: unknown }).title != null
      ) {
        title = String((snap as { title?: unknown }).title).trim();
      }
      if (!title) {
        const campRaw = (data as { store_coupon_campaigns?: unknown }).store_coupon_campaigns;
        const camp = Array.isArray(campRaw) ? campRaw[0] : campRaw;
        if (camp && typeof camp === "object" && (camp as { title?: unknown }).title != null) {
          title = String((camp as { title?: unknown }).title).trim();
        }
      }
    }
  }

  if (!title && campaignId) {
    const { data: camp } = await sb
      .from("store_coupon_campaigns")
      .select("title")
      .eq("id", campaignId)
      .maybeSingle();
    if (camp?.title) title = String(camp.title).trim();
  }

  return {
    ...order,
    ...(title ? { coupon_offer_title: title } : {}),
    ...(number ? { coupon_number: number } : {}),
  };
}
