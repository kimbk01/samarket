/**
 * CUT 5 — load store_banner_ad_campaigns for HOME hero resolver.
 */

import type { SupabaseClient } from "@supabase/supabase-js";
import {
  STORE_BANNER_AD_CAMPAIGN_TABLE,
  isStoreBannerAdSurface,
  type StoreBannerAdCampaignRow,
  type StoreBannerAdSurface,
} from "@/lib/stores/store-banner-ad-campaign-authority";
import {
  selectVisibleStoreBannerAdCampaigns,
  type StoresHomeHeroBannerSlide,
} from "@/lib/stores/store-banner-ad-exposure";

function mapBannerRow(raw: Record<string, unknown>): StoreBannerAdCampaignRow | null {
  if (!isStoreBannerAdSurface(raw.surface)) return null;
  const id = String(raw.id ?? "").trim();
  const imageUrl = String(raw.image_url ?? "").trim();
  const startAt = String(raw.start_at ?? "").trim();
  const endAt = String(raw.end_at ?? "").trim();
  if (!id || !imageUrl || !startAt || !endAt) return null;
  const sortOrder = Number(raw.sort_order);
  return {
    id,
    surface: raw.surface,
    title: raw.title == null ? null : String(raw.title).trim() || null,
    subtitle: raw.subtitle == null ? null : String(raw.subtitle).trim() || null,
    imageUrl,
    ctaHref: raw.cta_href == null ? "" : String(raw.cta_href).trim(),
    sortOrder: Number.isFinite(sortOrder) ? sortOrder : 0,
    startAt,
    endAt,
    isActive: raw.is_active === true,
  };
}

/**
 * Load campaigns for a surface (active filter at DB is best-effort;
 * visibility is decided ONLY by selectVisibleStoreBannerAdCampaigns).
 */
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
    const mapped = mapBannerRow(row as Record<string, unknown>);
    if (mapped) parsed.push(mapped);
  }
  return parsed;
}

export async function loadVisibleStoresHomeHeroBanners(
  sb: SupabaseClient,
  nowMs: number = Date.now()
): Promise<StoresHomeHeroBannerSlide[]> {
  const campaigns = await loadStoreBannerAdCampaignsForSurface(sb, "stores_home_hero");
  return selectVisibleStoreBannerAdCampaigns({
    campaigns,
    targetSurface: "stores_home_hero",
    nowMs,
  }).visible;
}
