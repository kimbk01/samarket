/**
 * CUT E — load HOME hero banners via campaign→inventory→creative SSOT.
 * Fail-closed: query errors → []; missing creative → omit slide (page stays healthy).
 * Legacy image_url is compatibility read only when creative missing for older ACTIVE rows.
 */

import type { SupabaseClient } from "@supabase/supabase-js";
import {
  STORE_BANNER_AD_CAMPAIGN_TABLE,
  type StoreBannerAdCampaignRow,
  type StoreBannerAdSurface,
  isStoreBannerAdSurface,
  compareStoreBannerAdCampaigns,
} from "@/lib/stores/store-banner-ad-campaign-authority";
import type { StoresHomeHeroBannerSlide } from "@/lib/stores/store-banner-ad-exposure";
import { evaluateBannerHomeHeroExposure } from "@/lib/stores/advertising/banner-home-hero-exposure";
import type {
  DeliveryAdLifecycleStatus,
  DeliveryAdReviewStatus,
} from "@/lib/stores/advertising/delivery-ad-lifecycle";
import { DELIVERY_AD_CREATIVE_TABLE } from "@/lib/stores/advertising/delivery-ad-creative";
import { inventoryViewFromKey } from "@/lib/stores/advertising/delivery-ad-banner-contract";
import { issueEligibleDeliveryAdExposure } from "@/lib/stores/advertising/delivery-ad-exposure-token";
import { loadDeliveryAdFundingStatusByCampaignIds } from "@/lib/stores/advertising/load-delivery-ad-campaign-funding-status";

const BANNER_JUNCTION = "delivery_banner_campaign_inventories";
const INVENTORY_TABLE = "delivery_ad_inventories";

export type HomeHeroBannerResolvedSlide = StoresHomeHeroBannerSlide & {
  inventoryKey: "STORES_HOME_HERO";
  aspectRatioWidth: number;
  aspectRatioHeight: number;
  cropPolicy: string;
  objectPosition: string;
  creativeId: string | null;
  /** Present for sort / window debugging; optional on compatibility slides. */
  startAt?: string;
  /** CUT G — server-issued; customer events only. */
  exposureToken?: string | null;
  storeId?: string | null;
};

function isLifecycle(v: unknown): v is DeliveryAdLifecycleStatus {
  return typeof v === "string" && v.length > 0;
}
function isReview(v: unknown): v is DeliveryAdReviewStatus {
  return typeof v === "string" && v.length > 0;
}

async function loadInventoryKeysByCampaign(
  sb: SupabaseClient,
  campaignIds: string[]
): Promise<Map<string, string[]>> {
  const out = new Map<string, string[]>();
  if (!campaignIds.length) return out;
  const { data: links } = await sb
    .from(BANNER_JUNCTION)
    .select("campaign_id, inventory_id")
    .in("campaign_id", campaignIds);
  if (!links?.length) return out;
  const invIds = [...new Set(links.map((r) => String((r as { inventory_id: string }).inventory_id)))];
  const { data: invs } = await sb.from(INVENTORY_TABLE).select("id, key, is_active").in("id", invIds);
  const keyById = new Map<string, string>();
  for (const inv of invs ?? []) {
    const row = inv as { id: string; key: string; is_active?: boolean };
    if (row.is_active === false) continue;
    keyById.set(String(row.id), String(row.key));
  }
  for (const link of links) {
    const cid = String((link as { campaign_id: string }).campaign_id);
    const key = keyById.get(String((link as { inventory_id: string }).inventory_id));
    if (!key) continue;
    const list = out.get(cid) ?? [];
    if (!list.includes(key)) list.push(key);
    out.set(cid, list);
  }
  return out;
}

/**
 * Canonical HOME HERO loader — lifecycle ACTIVE + APPROVED + inventory + creative.
 */
export async function loadVisibleStoresHomeHeroBanners(
  sb: SupabaseClient,
  nowMs: number = Date.now()
): Promise<HomeHeroBannerResolvedSlide[]> {
  try {
    const { data, error } = await sb
      .from(STORE_BANNER_AD_CAMPAIGN_TABLE)
      .select(
        "id, surface, title, subtitle, image_url, cta_href, sort_order, start_at, end_at, is_active, store_id, creative_id, lifecycle_status, review_status, campaign_source"
      )
      .eq("surface", "stores_home_hero")
      .eq("lifecycle_status", "ACTIVE")
      .eq("review_status", "APPROVED");

    if (error) {
      // Compatibility: pre-lifecycle columns
      if (/lifecycle_status|review_status|column/i.test(String(error.message))) {
        return loadVisibleStoresHomeHeroBannersLegacy(sb, nowMs);
      }
      console.error("[loadVisibleStoresHomeHeroBanners]", error.message);
      return [];
    }

    const rows = (data ?? []) as Record<string, unknown>[];
    const ids = rows.map((r) => String(r.id ?? "")).filter(Boolean);
    const [invMap, fundingMap] = await Promise.all([
      loadInventoryKeysByCampaign(sb, ids),
      loadDeliveryAdFundingStatusByCampaignIds(sb, {
        productKind: "banner",
        campaignIds: ids,
      }),
    ]);

    const creativeIds = rows
      .map((r) => (r.creative_id == null ? "" : String(r.creative_id)))
      .filter(Boolean);
    const creativeById = new Map<
      string,
      { assetPath: string; reviewStatus: DeliveryAdReviewStatus | null }
    >();
    if (creativeIds.length) {
      const { data: creatives } = await sb
        .from(DELIVERY_AD_CREATIVE_TABLE)
        .select("id, asset_path, review_status")
        .in("id", creativeIds);
      for (const c of creatives ?? []) {
        const raw = c as Record<string, unknown>;
        creativeById.set(String(raw.id), {
          assetPath: String(raw.asset_path ?? "").trim(),
          reviewStatus: isReview(raw.review_status) ? raw.review_status : null,
        });
      }
    }

    const invView = inventoryViewFromKey("STORES_HOME_HERO");
    const eligible: Array<{
      slide: HomeHeroBannerResolvedSlide;
      sortOrder: number;
      startAt: string;
    }> = [];

    for (const raw of rows) {
      const id = String(raw.id ?? "").trim();
      if (!id || !isLifecycle(raw.lifecycle_status) || !isReview(raw.review_status)) continue;

      const creativeId = raw.creative_id == null ? null : String(raw.creative_id);
      const creative = creativeId ? creativeById.get(creativeId) : null;
      const legacyUrl = String(raw.image_url ?? "").trim();
      const assetPath = creative?.assetPath || legacyUrl;
      const inventoryKeys = invMap.get(id) ?? (legacyUrl ? ["STORES_HOME_HERO"] : []);

      const gate = evaluateBannerHomeHeroExposure({
        campaign: {
          id,
          lifecycleStatus: raw.lifecycle_status,
          reviewStatus: raw.review_status,
          startAt: String(raw.start_at ?? ""),
          endAt: String(raw.end_at ?? ""),
          inventoryKeys,
          creativeAssetPath: assetPath,
          creativeReviewStatus: creative?.reviewStatus ?? null,
          ctaHref: String(raw.cta_href ?? ""),
          storeId: raw.store_id == null ? null : String(raw.store_id),
          campaignSource: raw.campaign_source == null ? "OWNER_PAID" : String(raw.campaign_source),
          fundingStatus: fundingMap.get(id) ?? "UNFUNDED",
        },
        nowMs,
      });
      if (!gate.ok) continue;

      const storeId = raw.store_id == null ? null : String(raw.store_id);
      const { token } = storeId
        ? issueEligibleDeliveryAdExposure({
            campaignId: id,
            productKind: "banner",
            creativeId,
            inventoryId: null,
            storeId,
            surface: "STORES_HOME_HERO",
            placementIndex: Number(raw.sort_order) || 0,
            destinationType: "store_detail",
            destinationId: storeId,
            preview: false,
          })
        : { token: null as string | null };

      eligible.push({
        sortOrder: Number(raw.sort_order) || 0,
        startAt: String(raw.start_at ?? ""),
        slide: {
          id,
          imageUrl: assetPath,
          title: raw.title == null ? null : String(raw.title).trim() || null,
          subtitle: raw.subtitle == null ? null : String(raw.subtitle).trim() || null,
          ctaHref: String(raw.cta_href ?? "").trim(),
          sortOrder: Number(raw.sort_order) || 0,
          inventoryKey: "STORES_HOME_HERO",
          aspectRatioWidth: invView.aspectRatioWidth,
          aspectRatioHeight: invView.aspectRatioHeight,
          cropPolicy: invView.cropPolicy,
          objectPosition: invView.objectPosition,
          creativeId,
          exposureToken: token,
          storeId,
        },
      });
    }

    eligible.sort((a, b) =>
      compareStoreBannerAdCampaigns(
        { id: a.slide.id, sortOrder: a.sortOrder, startAt: a.startAt },
        { id: b.slide.id, sortOrder: b.sortOrder, startAt: b.startAt }
      )
    );
    return eligible.map((e) => e.slide);
  } catch (e) {
    console.error("[loadVisibleStoresHomeHeroBanners]", e instanceof Error ? e.message : e);
    return [];
  }
}

/** Pre-CUT-B/E fallback — is_active + image_url only. */
async function loadVisibleStoresHomeHeroBannersLegacy(
  sb: SupabaseClient,
  nowMs: number
): Promise<HomeHeroBannerResolvedSlide[]> {
  const { data, error } = await sb
    .from(STORE_BANNER_AD_CAMPAIGN_TABLE)
    .select(
      "id, surface, title, subtitle, image_url, cta_href, sort_order, start_at, end_at, is_active"
    )
    .eq("surface", "stores_home_hero")
    .eq("is_active", true);
  if (error) {
    console.error("[loadVisibleStoresHomeHeroBannersLegacy]", error.message);
    return [];
  }
  const invView = inventoryViewFromKey("STORES_HOME_HERO");
  const out: HomeHeroBannerResolvedSlide[] = [];
  for (const row of data ?? []) {
    const raw = row as Record<string, unknown>;
    if (!isStoreBannerAdSurface(raw.surface)) continue;
    const imageUrl = String(raw.image_url ?? "").trim();
    if (!imageUrl) continue;
    const startMs = Date.parse(String(raw.start_at ?? ""));
    const endMs = Date.parse(String(raw.end_at ?? ""));
    if (!Number.isFinite(startMs) || !Number.isFinite(endMs)) continue;
    if (!(startMs <= nowMs && endMs > nowMs)) continue;
    out.push({
      id: String(raw.id),
      imageUrl,
      title: raw.title == null ? null : String(raw.title),
      subtitle: raw.subtitle == null ? null : String(raw.subtitle),
      ctaHref: String(raw.cta_href ?? ""),
      sortOrder: Number(raw.sort_order) || 0,
      startAt: String(raw.start_at ?? ""),
      inventoryKey: "STORES_HOME_HERO",
      aspectRatioWidth: invView.aspectRatioWidth,
      aspectRatioHeight: invView.aspectRatioHeight,
      cropPolicy: invView.cropPolicy,
      objectPosition: invView.objectPosition,
      creativeId: null,
    });
  }
  out.sort((a, b) =>
    compareStoreBannerAdCampaigns(
      { id: a.id, sortOrder: a.sortOrder, startAt: a.startAt ?? "" },
      { id: b.id, sortOrder: b.sortOrder, startAt: b.startAt ?? "" }
    )
  );
  return out;
}

/** Kept for Admin/compat callers that need raw table rows. */
export async function loadStoreBannerAdCampaignsForSurface(
  sb: SupabaseClient,
  surface: StoreBannerAdSurface
): Promise<StoreBannerAdCampaignRow[]> {
  const { data, error } = await sb
    .from(STORE_BANNER_AD_CAMPAIGN_TABLE)
    .select(
      "id, surface, title, subtitle, image_url, cta_href, sort_order, start_at, end_at, is_active"
    )
    .eq("surface", surface);
  if (error) {
    if (error.message?.includes(STORE_BANNER_AD_CAMPAIGN_TABLE)) return [];
    console.error("[loadStoreBannerAdCampaignsForSurface]", error.message);
    return [];
  }
  const parsed: StoreBannerAdCampaignRow[] = [];
  for (const row of data ?? []) {
    const raw = row as Record<string, unknown>;
    if (!isStoreBannerAdSurface(raw.surface)) continue;
    const id = String(raw.id ?? "").trim();
    const imageUrl = String(raw.image_url ?? "").trim();
    if (!id || !imageUrl) continue;
    parsed.push({
      id,
      surface: raw.surface,
      title: raw.title == null ? null : String(raw.title),
      subtitle: raw.subtitle == null ? null : String(raw.subtitle),
      imageUrl,
      ctaHref: raw.cta_href == null ? "" : String(raw.cta_href),
      sortOrder: Number(raw.sort_order) || 0,
      startAt: String(raw.start_at ?? ""),
      endAt: String(raw.end_at ?? ""),
      isActive: raw.is_active === true,
    });
  }
  return parsed;
}
