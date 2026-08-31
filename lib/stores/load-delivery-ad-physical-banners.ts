/**
 * Stage 2 — load Banner campaigns for a physical inventory key + DB surface.
 * Fail-closed. Does not use native insertion planners.
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
import { loadDeliveryAdFundingStatusByCampaignIds } from "@/lib/stores/advertising/load-delivery-ad-campaign-funding-status";
import { evaluateBannerPhysicalInventoryExposure } from "@/lib/stores/advertising/banner-physical-inventory-exposure";
import type { DeliveryAdInventoryKey } from "@/lib/stores/advertising/delivery-ad-inventory";
import type { BannerAdDbSurface } from "@/lib/stores/advertising/delivery-ad-placement";

export type PhysicalBannerResolvedSlide = {
  id: string;
  imageUrl: string;
  title: string | null;
  subtitle: string | null;
  ctaHref: string;
  sortOrder: number;
  inventoryKey: DeliveryAdInventoryKey;
  aspectRatioWidth: number;
  aspectRatioHeight: number;
  cropPolicy: string;
  objectPosition: string;
  creativeId: string | null;
  exposureToken?: string | null;
  storeId?: string | null;
};

const BANNER_JUNCTION = "delivery_banner_campaign_inventories";
const INVENTORY_TABLE = "delivery_ad_inventories";

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

export async function loadVisiblePhysicalBannerSlides(
  sb: SupabaseClient,
  input: {
    inventoryKey: DeliveryAdInventoryKey;
    dbSurface: BannerAdDbSurface;
    physicalEnabled: boolean;
    capacity?: number;
    nowMs?: number;
  }
): Promise<PhysicalBannerResolvedSlide[]> {
  if (!input.physicalEnabled) return [];
  const nowMs = input.nowMs ?? Date.now();
  const capacity = Math.max(1, Math.min(3, input.capacity ?? 1));

  try {
    const { data, error } = await sb
      .from(STORE_BANNER_AD_CAMPAIGN_TABLE)
      .select(
        "id, surface, title, subtitle, image_url, cta_href, sort_order, start_at, end_at, store_id, creative_id, lifecycle_status, review_status, campaign_source"
      )
      .eq("surface", input.dbSurface)
      .eq("lifecycle_status", "ACTIVE")
      .eq("review_status", "APPROVED");

    if (error) {
      console.error("[loadVisiblePhysicalBannerSlides]", error.message);
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

    const invView = inventoryViewFromKey(input.inventoryKey);
    const eligible: Array<{
      slide: PhysicalBannerResolvedSlide;
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
      const inventoryKeys = invMap.get(id) ?? [];

      const gate = evaluateBannerPhysicalInventoryExposure({
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
        inventoryKey: input.inventoryKey,
        physicalEnabled: input.physicalEnabled,
        commercialSellable: true,
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
            surface: input.inventoryKey,
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
          inventoryKey: input.inventoryKey,
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
    return eligible.slice(0, capacity).map((e) => e.slide);
  } catch (e) {
    console.error("[loadVisiblePhysicalBannerSlides]", e instanceof Error ? e.message : e);
    return [];
  }
}
