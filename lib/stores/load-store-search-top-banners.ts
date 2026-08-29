/**
 * CUT J — load SEARCH_TOP banners via inventory SSOT.
 * Fail-closed: errors → null slide (organic search continues).
 */

import type { SupabaseClient } from "@supabase/supabase-js";
import { STORE_BANNER_AD_CAMPAIGN_TABLE } from "@/lib/stores/store-banner-ad-campaign-authority";
import { compareStoreBannerAdCampaigns } from "@/lib/stores/store-banner-ad-campaign-authority";
import type {
  DeliveryAdLifecycleStatus,
  DeliveryAdReviewStatus,
} from "@/lib/stores/advertising/delivery-ad-lifecycle";
import { DELIVERY_AD_CREATIVE_TABLE } from "@/lib/stores/advertising/delivery-ad-creative";
import { inventoryViewFromKey } from "@/lib/stores/advertising/delivery-ad-banner-contract";
import { issueEligibleDeliveryAdExposure } from "@/lib/stores/advertising/delivery-ad-exposure-token";
import {
  selectSearchTopBannerCampaign,
  STORES_SEARCH_TOP_SLOT_POLICY,
} from "@/lib/stores/advertising/banner-search-top-exposure";

const BANNER_JUNCTION = "delivery_banner_campaign_inventories";
const INVENTORY_TABLE = "delivery_ad_inventories";

export type SearchTopBannerSlide = {
  campaignId: string;
  storeId: string;
  imageUrl: string;
  href: string;
  headline: string | null;
  subcopy: string | null;
  inventoryKey: "STORES_SEARCH_TOP";
  aspectRatioWidth: number;
  aspectRatioHeight: number;
  exposureToken: string;
};

function isLifecycle(v: unknown): v is DeliveryAdLifecycleStatus {
  return typeof v === "string" && v.length > 0;
}
function isReview(v: unknown): v is DeliveryAdReviewStatus {
  return typeof v === "string" && v.length > 0;
}

/**
 * Resolve at most one SEARCH_TOP banner when organic store results exist.
 * Does not modify organic ranking / ids.
 */
export async function loadStoresSearchTopBannerSlide(
  sb: SupabaseClient,
  input: {
    organicStoreIds: readonly string[];
    query: string;
    nowMs?: number;
  }
): Promise<SearchTopBannerSlide | null> {
  try {
    if (!STORES_SEARCH_TOP_SLOT_POLICY.requireNonEmptyQuery) return null;
    if (!String(input.query ?? "").trim()) return null;
    if (!input.organicStoreIds.length) return null;

    const nowMs = input.nowMs ?? Date.now();
    const { data: rows, error } = await sb
      .from(STORE_BANNER_AD_CAMPAIGN_TABLE)
      .select(
        "id, surface, store_id, title, subtitle, image_url, cta_href, sort_order, start_at, end_at, is_active, lifecycle_status, review_status, creative_id"
      )
      .eq("surface", "stores_search")
      .eq("lifecycle_status", "ACTIVE")
      .eq("review_status", "APPROVED");

    if (error || !rows?.length) return null;

    const campaignIds = rows.map((r) => String((r as { id: string }).id));
    const { data: links } = await sb
      .from(BANNER_JUNCTION)
      .select("campaign_id, inventory_id")
      .in("campaign_id", campaignIds);
    const invIds = [
      ...new Set((links ?? []).map((l) => String((l as { inventory_id: string }).inventory_id))),
    ];
    const { data: invs } = await sb
      .from(INVENTORY_TABLE)
      .select("id, key, is_active")
      .in("id", invIds);
    const keyByInvId = new Map<string, string>();
    for (const inv of invs ?? []) {
      const row = inv as { id: string; key: string; is_active?: boolean };
      if (row.is_active === false) continue;
      keyByInvId.set(String(row.id), String(row.key));
    }
    const keysByCampaign = new Map<string, string[]>();
    for (const link of links ?? []) {
      const cid = String((link as { campaign_id: string }).campaign_id);
      const key = keyByInvId.get(String((link as { inventory_id: string }).inventory_id));
      if (!key) continue;
      const list = keysByCampaign.get(cid) ?? [];
      if (!list.includes(key)) list.push(key);
      keysByCampaign.set(cid, list);
    }

    const creativeIds = rows
      .map((r) => (r as { creative_id?: string | null }).creative_id)
      .filter((id): id is string => Boolean(id));
    const { data: creatives } = creativeIds.length
      ? await sb
          .from(DELIVERY_AD_CREATIVE_TABLE)
          .select("id, asset_path, headline, subcopy, review_status, cta_type, cta_target_id")
          .in("id", creativeIds)
      : { data: [] as unknown[] };
    const creativeById = new Map<string, Record<string, unknown>>();
    for (const c of creatives ?? []) {
      const row = c as Record<string, unknown>;
      creativeById.set(String(row.id), row);
    }

    const sorted = [...rows].sort((a, b) =>
      compareStoreBannerAdCampaigns(
        {
          id: String((a as { id: string }).id),
          sortOrder: Number((a as { sort_order?: number }).sort_order) || 0,
          startAt: String((a as { start_at: string }).start_at),
        },
        {
          id: String((b as { id: string }).id),
          sortOrder: Number((b as { sort_order?: number }).sort_order) || 0,
          startAt: String((b as { start_at: string }).start_at),
        }
      )
    );

    const candidates = sorted.map((raw) => {
      const r = raw as Record<string, unknown>;
      const id = String(r.id);
      const creative = r.creative_id ? creativeById.get(String(r.creative_id)) : null;
      const assetPath = String(creative?.asset_path ?? r.image_url ?? "").trim();
      return {
        id,
        storeId: r.store_id == null ? null : String(r.store_id),
        lifecycleStatus: isLifecycle(r.lifecycle_status) ? r.lifecycle_status : ("DRAFT" as const),
        reviewStatus: isReview(r.review_status) ? r.review_status : ("NOT_SUBMITTED" as const),
        startAt: String(r.start_at ?? ""),
        endAt: String(r.end_at ?? ""),
        inventoryKeys: keysByCampaign.get(id) ?? [],
        creativeAssetPath: assetPath || null,
        creativeReviewStatus: creative?.review_status
          ? isReview(creative.review_status)
            ? creative.review_status
            : null
          : null,
        ctaHref: String(r.cta_href ?? ""),
        title: r.title == null ? null : String(r.title),
        subtitle: r.subtitle == null ? null : String(r.subtitle),
        headline: creative?.headline == null ? null : String(creative.headline),
        subcopy: creative?.subcopy == null ? null : String(creative.subcopy),
      };
    });

    const picked = selectSearchTopBannerCampaign(candidates, input.organicStoreIds, nowMs);
    if (!picked || !picked.storeId || !picked.creativeAssetPath) return null;

    const inv = inventoryViewFromKey("STORES_SEARCH_TOP");
    const href = String(picked.ctaHref ?? "").trim();
    const { token } = issueEligibleDeliveryAdExposure({
      campaignId: picked.id,
      productKind: "banner",
      storeId: picked.storeId,
      surface: "STORES_SEARCH_TOP",
      destinationType: "store_detail",
      destinationId: picked.storeId,
      creativeId: null,
      inventoryId: null,
      placementIndex: 0,
    });

    const imageUrl = picked.creativeAssetPath;

    return {
      campaignId: picked.id,
      storeId: picked.storeId,
      imageUrl,
      href,
      headline: picked.headline ?? picked.title,
      subcopy: picked.subcopy ?? picked.subtitle,
      inventoryKey: "STORES_SEARCH_TOP",
      aspectRatioWidth: inv.aspectRatioWidth,
      aspectRatioHeight: inv.aspectRatioHeight,
      exposureToken: token,
    };
  } catch (e) {
    console.error("[loadStoresSearchTopBannerSlide]", e instanceof Error ? e.message : e);
    return null;
  }
}
