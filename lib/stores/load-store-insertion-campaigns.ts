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
import type { OwnerStoreSponsoredInventoryKey } from "@/lib/stores/advertising/owner-store-sponsored-contract";
import type {
  DeliveryAdLifecycleStatus,
  DeliveryAdReviewStatus,
} from "@/lib/stores/advertising/delivery-ad-lifecycle";
import { isSponsoredScheduleActive } from "@/lib/stores/advertising/store-sponsored-exposure-eligibility";
import { lifecycleImpliesIsActive } from "@/lib/stores/advertising/delivery-ad-lifecycle";
import { loadDeliveryAdFundingStatusByCampaignIds } from "@/lib/stores/advertising/load-delivery-ad-campaign-funding-status";

const JUNCTION_TABLE = "delivery_store_sponsored_campaign_inventories";
const INVENTORY_TABLE = "delivery_ad_inventories";

const PAID_SELECT =
  "id, store_id, placement, title, headline, body_copy, image_url, start_at, end_at, is_active, lifecycle_status, review_status, campaign_source, browse_target_kind, browse_primary_slug, browse_secondary_slug";

function mapPaidAd(
  raw: Record<string, unknown>,
  inventoryKeys: OwnerStoreSponsoredInventoryKey[] = [],
  fundingStatus: StorePaidAdCampaignRow["fundingStatus"] = "UNFUNDED"
): StorePaidAdCampaignRow | null {
  const placement = raw.placement;
  if (!isStorePaidAdPlacement(placement)) return null;
  const id = String(raw.id ?? "").trim();
  const storeId = String(raw.store_id ?? "").trim();
  const title = String(raw.title ?? "").trim();
  const headline = String(raw.headline ?? "").trim();
  const startAt = String(raw.start_at ?? "").trim();
  const endAt = String(raw.end_at ?? "").trim();
  if (!id || !storeId || !title || !headline || !startAt || !endAt) return null;

  const lifecycleRaw = String(raw.lifecycle_status ?? "").trim();
  const reviewRaw = String(raw.review_status ?? "").trim();
  const lifecycleStatus = (lifecycleRaw || undefined) as DeliveryAdLifecycleStatus | undefined;
  const reviewStatus = (reviewRaw || undefined) as DeliveryAdReviewStatus | undefined;

  const isActive =
    lifecycleStatus != null
      ? lifecycleImpliesIsActive(lifecycleStatus) && reviewStatus === "APPROVED"
      : raw.is_active === true;

  const browseKindRaw = String(raw.browse_target_kind ?? "").trim();
  const browseTargetKind =
    browseKindRaw === "primary" || browseKindRaw === "secondary" ? browseKindRaw : null;

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
    isActive,
    lifecycleStatus,
    reviewStatus,
    inventoryKeys,
    campaignSource: raw.campaign_source == null ? "OWNER_PAID" : String(raw.campaign_source),
    fundingStatus,
    browseTargetKind,
    browsePrimarySlug:
      raw.browse_primary_slug == null ? null : String(raw.browse_primary_slug).trim() || null,
    browseSecondarySlug:
      raw.browse_secondary_slug == null ? null : String(raw.browse_secondary_slug).trim() || null,
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

async function loadInventoryKeysByCampaignId(
  sb: SupabaseClient,
  campaignIds: string[]
): Promise<Map<string, OwnerStoreSponsoredInventoryKey[]>> {
  const out = new Map<string, OwnerStoreSponsoredInventoryKey[]>();
  if (!campaignIds.length) return out;

  const { data: links, error } = await sb
    .from(JUNCTION_TABLE)
    .select("campaign_id, inventory_id")
    .in("campaign_id", campaignIds);
  if (error || !links?.length) return out;

  const inventoryIds = [
    ...new Set(links.map((r) => String((r as { inventory_id: string }).inventory_id))),
  ];
  const { data: invs } = await sb
    .from(INVENTORY_TABLE)
    .select("id, key, is_active")
    .in("id", inventoryIds);
  const keyById = new Map<string, string>();
  for (const inv of invs ?? []) {
    const row = inv as { id: string; key: string; is_active?: boolean };
    if (row.is_active === false) continue;
    keyById.set(String(row.id), String(row.key));
  }

  for (const link of links) {
    const cid = String((link as { campaign_id: string }).campaign_id);
    const key = keyById.get(String((link as { inventory_id: string }).inventory_id));
    if (key !== "STORES_HOME_FEED" && key !== "STORES_CATEGORY_FEED") continue;
    const list = out.get(cid) ?? [];
    if (!list.includes(key)) list.push(key);
    out.set(cid, list);
  }
  return out;
}

/**
 * CUT D — load ACTIVE + APPROVED sponsored campaigns for a legacy placement surface.
 * Fail-closed: any query error → empty list (organic callers must continue).
 */
export async function loadActiveStorePaidAdCampaigns(
  sb: SupabaseClient,
  placement: StorePaidAdPlacement,
  nowMs: number = Date.now()
): Promise<StorePaidAdCampaignRow[]> {
  try {
    const { data, error } = await sb
      .from(STORE_PAID_AD_CAMPAIGN_TABLE)
      .select(PAID_SELECT)
      .eq("placement", placement)
      .eq("lifecycle_status", "ACTIVE")
      .eq("review_status", "APPROVED");

    if (error) {
      // Compatibility: older DBs without lifecycle columns
      if (/lifecycle_status|review_status|column/i.test(String(error.message))) {
        return loadActiveStorePaidAdCampaignsLegacy(sb, placement, nowMs);
      }
      if (/browse_target_kind|browse_primary_slug|browse_secondary_slug/i.test(String(error.message))) {
        return loadActiveStorePaidAdCampaignsWithoutBrowseTarget(sb, placement, nowMs);
      }
      if (error.message?.includes(STORE_PAID_AD_CAMPAIGN_TABLE)) return [];
      console.error("[loadActiveStorePaidAdCampaigns]", error.message);
      return [];
    }

    const rows = (data ?? []) as unknown as Record<string, unknown>[];
    const ids = rows.map((r) => String(r.id ?? "")).filter(Boolean);
    const [invMap, fundingMap] = await Promise.all([
      loadInventoryKeysByCampaignId(sb, ids),
      loadDeliveryAdFundingStatusByCampaignIds(sb, {
        productKind: "store_sponsored",
        campaignIds: ids,
      }),
    ]);

    const parsed: StorePaidAdCampaignRow[] = [];
    for (const raw of rows) {
      const id = String(raw.id ?? "");
      const mapped = mapPaidAd(raw, invMap.get(id) ?? [], fundingMap.get(id) ?? "UNFUNDED");
      if (!mapped) continue;
      if (!isSponsoredScheduleActive(mapped.startAt, mapped.endAt, nowMs)) continue;
      parsed.push(mapped);
    }
    return selectActiveStorePaidAdCampaigns(parsed, placement, nowMs);
  } catch (e) {
    console.error("[loadActiveStorePaidAdCampaigns]", e instanceof Error ? e.message : e);
    return [];
  }
}

/** Pre-browse-target recovery fallback. */
async function loadActiveStorePaidAdCampaignsWithoutBrowseTarget(
  sb: SupabaseClient,
  placement: StorePaidAdPlacement,
  nowMs: number
): Promise<StorePaidAdCampaignRow[]> {
  const selectWithoutBrowse = PAID_SELECT.replace(
    /, browse_target_kind, browse_primary_slug, browse_secondary_slug/,
    ""
  );
  try {
    const { data, error } = await sb
      .from(STORE_PAID_AD_CAMPAIGN_TABLE)
      .select(selectWithoutBrowse)
      .eq("placement", placement)
      .eq("lifecycle_status", "ACTIVE")
      .eq("review_status", "APPROVED");
    if (error) {
      if (/lifecycle_status|review_status|column/i.test(String(error.message))) {
        return loadActiveStorePaidAdCampaignsLegacy(sb, placement, nowMs);
      }
      return [];
    }
    const rows = (data ?? []) as unknown as Record<string, unknown>[];
    const ids = rows.map((r) => String(r.id ?? "")).filter(Boolean);
    const [invMap, fundingMap] = await Promise.all([
      loadInventoryKeysByCampaignId(sb, ids),
      loadDeliveryAdFundingStatusByCampaignIds(sb, {
        productKind: "store_sponsored",
        campaignIds: ids,
      }),
    ]);
    const parsed: StorePaidAdCampaignRow[] = [];
    for (const raw of rows) {
      const id = String(raw.id ?? "");
      const mapped = mapPaidAd(raw, invMap.get(id) ?? [], fundingMap.get(id) ?? "UNFUNDED");
      if (!mapped) continue;
      if (!isSponsoredScheduleActive(mapped.startAt, mapped.endAt, nowMs)) continue;
      parsed.push(mapped);
    }
    return selectActiveStorePaidAdCampaigns(parsed, placement, nowMs);
  } catch {
    return [];
  }
}

/** Pre-CUT-B fallback path — is_active only. */
async function loadActiveStorePaidAdCampaignsLegacy(
  sb: SupabaseClient,
  placement: StorePaidAdPlacement,
  nowMs: number
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
    console.error("[loadActiveStorePaidAdCampaignsLegacy]", error.message);
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
