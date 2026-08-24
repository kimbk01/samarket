import type { SupabaseClient } from "@supabase/supabase-js";
import {
  isStorePaidAdPlacement,
  selectActiveStorePaidAdCampaigns,
  type StorePaidAdCampaignRow,
  type StorePaidAdPlacement,
} from "@/lib/stores/store-paid-ad-campaign-authority";
import {
  selectActiveStoreCouponCampaigns,
  type StoreCouponCampaignRow,
} from "@/lib/stores/store-coupon-campaign-authority";
import { STORE_COUPON_CAMPAIGN_TABLE } from "@/lib/stores/store-coupon-campaign-authority";
import { STORE_PAID_AD_CAMPAIGN_TABLE } from "@/lib/stores/store-paid-ad-campaign-authority";

function mapPaidAd(raw: Record<string, unknown>): StorePaidAdCampaignRow | null {
  const placement = raw.placement;
  if (!isStorePaidAdPlacement(placement)) return null;
  const id = String(raw.id ?? "").trim();
  const storeId = String(raw.store_id ?? "").trim();
  const title = String(raw.title ?? "").trim();
  const headline = String(raw.headline ?? "").trim();
  const startAt = String(raw.start_at ?? "").trim();
  const endAt = String(raw.end_at ?? "").trim();
  if (!id || !storeId || !title || !headline || !startAt || !endAt) return null;
  return {
    id,
    storeId,
    placement,
    title,
    headline,
    bodyCopy: raw.body_copy == null ? null : String(raw.body_copy),
    imageUrl: raw.image_url == null ? null : String(raw.image_url).trim() || null,
    startAt,
    endAt,
    isActive: raw.is_active === true,
  };
}

function mapCoupon(raw: Record<string, unknown>): StoreCouponCampaignRow | null {
  const id = String(raw.id ?? "").trim();
  const storeId = String(raw.store_id ?? "").trim();
  const title = String(raw.title ?? "").trim();
  const discountType = raw.discount_type;
  const startAt = String(raw.start_at ?? "").trim();
  const endAt = String(raw.end_at ?? "").trim();
  const discountValue = Number(raw.discount_value);
  if (!id || !storeId || !title || !startAt || !endAt) return null;
  if (discountType !== "percent" && discountType !== "fixed_amount") return null;
  if (!Number.isFinite(discountValue)) return null;
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

export async function loadActiveStorePaidAdCampaigns(
  sb: SupabaseClient,
  placement: StorePaidAdPlacement,
  nowMs: number = Date.now()
): Promise<StorePaidAdCampaignRow[]> {
  const { data, error } = await sb
    .from(STORE_PAID_AD_CAMPAIGN_TABLE)
    .select(
      "id, store_id, placement, title, headline, body_copy, image_url, start_at, end_at, is_active"
    )
    .eq("placement", placement)
    .eq("is_active", true);

  if (error) {
    if (error.message?.includes(STORE_PAID_AD_CAMPAIGN_TABLE)) return [];
    console.error("[loadActiveStorePaidAdCampaigns]", error.message);
    return [];
  }

  const parsed: StorePaidAdCampaignRow[] = [];
  for (const row of data ?? []) {
    const mapped = mapPaidAd(row as Record<string, unknown>);
    if (mapped) parsed.push(mapped);
  }
  return selectActiveStorePaidAdCampaigns(parsed, placement, nowMs);
}

export async function loadActiveStoreCouponCampaigns(
  sb: SupabaseClient,
  nowMs: number = Date.now()
): Promise<StoreCouponCampaignRow[]> {
  const { data, error } = await sb
    .from(STORE_COUPON_CAMPAIGN_TABLE)
    .select(
      "id, store_id, title, discount_type, discount_value, min_order_amount, terms_copy, start_at, end_at, is_active"
    )
    .eq("is_active", true);

  if (error) {
    if (error.message?.includes(STORE_COUPON_CAMPAIGN_TABLE)) return [];
    console.error("[loadActiveStoreCouponCampaigns]", error.message);
    return [];
  }

  const parsed: StoreCouponCampaignRow[] = [];
  for (const row of data ?? []) {
    const mapped = mapCoupon(row as Record<string, unknown>);
    if (mapped) parsed.push(mapped);
  }
  return selectActiveStoreCouponCampaigns(parsed, nowMs);
}
