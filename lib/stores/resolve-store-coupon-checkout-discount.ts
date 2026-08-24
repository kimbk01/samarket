import type { SupabaseClient } from "@supabase/supabase-js";
import {
  type StoreCouponCampaignRow,
} from "@/lib/stores/store-coupon-campaign-authority";
import {
  computeStoreCouponDiscountPhp,
  resolveStoreCouponEligibility,
} from "@/lib/stores/store-coupon-eligibility";

export type ResolveStoreCouponCheckoutInput = {
  sb: SupabaseClient;
  buyerUserId: string;
  storeId: string;
  couponCampaignId: string;
  itemGrossPhp: number;
  nowMs?: number;
};

export type ResolveStoreCouponCheckoutOk = {
  ok: true;
  campaign: StoreCouponCampaignRow;
  discountAmount: number;
};

export type ResolveStoreCouponCheckoutErr = {
  ok: false;
  error:
    | "coupon_not_found"
    | "coupon_inactive"
    | "coupon_expired"
    | "coupon_wrong_store"
    | "coupon_min_order"
    | "coupon_already_redeemed"
    | "invalid_discount";
  status: number;
  min_order_amount?: number;
};

export type ResolveStoreCouponCheckoutResult =
  | ResolveStoreCouponCheckoutOk
  | ResolveStoreCouponCheckoutErr;

function mapCouponRow(raw: Record<string, unknown>): StoreCouponCampaignRow | null {
  const id = String(raw.id ?? "").trim();
  const storeId = String(raw.store_id ?? "").trim();
  const title = String(raw.title ?? "").trim();
  const discountType = raw.discount_type;
  const startAt = String(raw.start_at ?? "").trim();
  const endAt = String(raw.end_at ?? "").trim();
  const discountValue = Number(raw.discount_value);
  if (!id || !storeId || !title || !startAt || !endAt) return null;
  if (discountType !== "percent" && discountType !== "fixed_amount") return null;
  if (!Number.isFinite(discountValue) || discountValue <= 0) return null;
  return {
    id,
    storeId,
    title,
    discountType,
    discountValue,
    minOrderAmount: raw.min_order_amount == null ? null : Number(raw.min_order_amount),
    termsCopy: raw.terms_copy == null ? null : String(raw.terms_copy),
    startAt,
    endAt,
    isActive: raw.is_active === true,
  };
}

function mapEligibilityError(
  campaign: StoreCouponCampaignRow,
  state: ReturnType<typeof resolveStoreCouponEligibility>,
  nowMs: number
): ResolveStoreCouponCheckoutErr {
  const reasons = new Set(state.blockingReasons);
  if (reasons.has("storeMatched")) {
    return { ok: false, error: "coupon_wrong_store", status: 400 };
  }
  if (reasons.has("campaignActive") && !campaign.isActive) {
    return { ok: false, error: "coupon_inactive", status: 400 };
  }
  if (reasons.has("windowActive")) {
    const endMs = Date.parse(campaign.endAt);
    if (Number.isFinite(endMs) && endMs <= nowMs) {
      return { ok: false, error: "coupon_expired", status: 400 };
    }
    return { ok: false, error: "coupon_inactive", status: 400 };
  }
  if (reasons.has("minOrderMet")) {
    const minOrder =
      campaign.minOrderAmount != null && Number.isFinite(campaign.minOrderAmount)
        ? Math.floor(campaign.minOrderAmount)
        : undefined;
    return { ok: false, error: "coupon_min_order", status: 400, min_order_amount: minOrder };
  }
  if (reasons.has("notAlreadyRedeemed")) {
    return { ok: false, error: "coupon_already_redeemed", status: 409 };
  }
  return { ok: false, error: "invalid_discount", status: 400 };
}

/**
 * CUT 6 — checkout consumer of ONE eligibility authority + server discount.
 * Session coupon id is not final authority — this revalidates against DB.
 */
export async function resolveStoreCouponCheckoutDiscount(
  input: ResolveStoreCouponCheckoutInput
): Promise<ResolveStoreCouponCheckoutResult> {
  const campaignId = String(input.couponCampaignId ?? "").trim();
  const storeId = String(input.storeId ?? "").trim();
  const buyerUserId = String(input.buyerUserId ?? "").trim();
  const itemGrossPhp = Math.floor(input.itemGrossPhp);
  const nowMs = input.nowMs ?? Date.now();

  if (!campaignId) {
    return { ok: false, error: "coupon_not_found", status: 400 };
  }

  const { data, error } = await input.sb
    .from("store_coupon_campaigns")
    .select(
      "id, store_id, title, discount_type, discount_value, min_order_amount, terms_copy, start_at, end_at, is_active"
    )
    .eq("id", campaignId)
    .maybeSingle();

  if (error || !data) {
    return { ok: false, error: "coupon_not_found", status: 404 };
  }

  const campaign = mapCouponRow(data as Record<string, unknown>);
  if (!campaign) {
    return { ok: false, error: "invalid_discount", status: 400 };
  }

  const { data: prior } = await input.sb
    .from("store_coupon_redemptions")
    .select("id")
    .eq("buyer_user_id", buyerUserId)
    .eq("campaign_id", campaignId)
    .maybeSingle();

  const eligibility = resolveStoreCouponEligibility({
    campaign,
    nowMs,
    expectedStoreId: storeId,
    itemGrossPhp,
    alreadyRedeemed: Boolean(prior?.id),
  });

  if (!eligibility.eligible) {
    return mapEligibilityError(campaign, eligibility, nowMs);
  }

  const discountAmount = computeStoreCouponDiscountPhp(campaign, itemGrossPhp);
  if (discountAmount <= 0) {
    return { ok: false, error: "invalid_discount", status: 400 };
  }

  return { ok: true, campaign, discountAmount };
}

export async function recordStoreCouponRedemption(input: {
  sb: SupabaseClient;
  campaignId: string;
  storeId: string;
  buyerUserId: string;
  orderId: string;
  discountAmount: number;
}): Promise<{ ok: true } | { ok: false; error: string }> {
  const { error } = await input.sb.from("store_coupon_redemptions").insert({
    campaign_id: input.campaignId,
    store_id: input.storeId,
    buyer_user_id: input.buyerUserId,
    order_id: input.orderId,
    discount_amount_applied: Math.floor(input.discountAmount),
  });
  if (error) {
    if (error.code === "23505") return { ok: false, error: "coupon_already_redeemed" };
    console.error("[recordStoreCouponRedemption]", error.message);
    return { ok: false, error: "redemption_write_failed" };
  }
  const { error: orderPatchErr } = await input.sb
    .from("store_orders")
    .update({ coupon_campaign_id: input.campaignId })
    .eq("id", input.orderId);
  if (orderPatchErr) {
    console.error("[recordStoreCouponRedemption] order patch", orderPatchErr.message);
  }
  return { ok: true };
}
