import type { SupabaseClient } from "@supabase/supabase-js";
import {
  DELIVERY_HERO_CAPACITY,
  DELIVERY_HERO_PLACEMENT_KEY,
  HERO_OCCUPYING_LIFECYCLES,
  loadHeroOccupancyCampaigns,
  type HeroOccupancyCampaign,
} from "@/lib/admin/ads-exposure/capacity-gate";
import {
  adsOpsStatusLabel,
  projectAdsOpsStatus,
} from "@/lib/admin/ads-exposure/ops-status";
import { DELIVERY_AD_ADMIN_ROUTES } from "@/lib/stores/advertising/delivery-ad-routes";
import { STORE_BANNER_AD_CAMPAIGN_TABLE } from "@/lib/stores/store-banner-ad-campaign-authority";

export const HERO_PLACEMENT_CAMPAIGN_AUTHORITY = STORE_BANNER_AD_CAMPAIGN_TABLE;

export type HeroPlacementSlot = {
  slideIndex: number;
  occupied: boolean;
  campaignId: string | null;
  campaignLabel: string | null;
  creativeThumbUrl: string | null;
  applicantOrSource: string | null;
  scheduleLabel: string | null;
  lifecycleLabel: { ko: string; en: string } | null;
  sortOrder: number | null;
  href: string | null;
};

function compareHeroCampaigns(a: HeroOccupancyCampaign, b: HeroOccupancyCampaign): number {
  const aOrder = a.sortOrder ?? Number.MAX_SAFE_INTEGER;
  const bOrder = b.sortOrder ?? Number.MAX_SAFE_INTEGER;
  if (aOrder !== bOrder) return aOrder - bOrder;
  const aStart = a.startAt ? Date.parse(a.startAt) : Number.MAX_SAFE_INTEGER;
  const bStart = b.startAt ? Date.parse(b.startAt) : Number.MAX_SAFE_INTEGER;
  if (aStart !== bStart) return aStart - bStart;
  return a.id.localeCompare(b.id);
}

function sourceLabel(campaign: HeroOccupancyCampaign): string {
  if (campaign.storeName && campaign.storeId) return campaign.storeName;
  const source = String(campaign.campaignSource ?? "").toUpperCase();
  if (source === "DIBAY_FIRST_PARTY" || source === "ADMIN_DIRECT") return "ADMIN_DIRECT";
  if (campaign.ownerUserId) return "OWNER";
  return source || "ADMIN";
}

function scheduleLabel(campaign: HeroOccupancyCampaign): string | null {
  if (!campaign.startAt && !campaign.endAt) return null;
  return `${campaign.startAt?.slice(0, 16) ?? "—"} → ${campaign.endAt?.slice(0, 16) ?? "—"}`;
}

/** Pure fixed-capacity projection for the operator's Slide 1..5 board. */
export function projectHeroPlacementSlots(
  campaigns: readonly HeroOccupancyCampaign[]
): HeroPlacementSlot[] {
  const occupied = campaigns
    .filter(
      (campaign) =>
        campaign.inventoryKeys.includes(DELIVERY_HERO_PLACEMENT_KEY) &&
        HERO_OCCUPYING_LIFECYCLES.has(campaign.lifecycleStatus.toUpperCase())
    )
    .slice()
    .sort(compareHeroCampaigns)
    .slice(0, DELIVERY_HERO_CAPACITY);

  return Array.from({ length: DELIVERY_HERO_CAPACITY }, (_, index) => {
    const campaign = occupied[index] ?? null;
    if (!campaign) {
      return {
        slideIndex: index + 1,
        occupied: false,
        campaignId: null,
        campaignLabel: null,
        creativeThumbUrl: null,
        applicantOrSource: null,
        scheduleLabel: null,
        lifecycleLabel: null,
        sortOrder: null,
        href: null,
      };
    }
    const status = projectAdsOpsStatus({
      rawStatus: campaign.lifecycleStatus,
      startAt: campaign.startAt,
      endAt: campaign.endAt,
    });
    return {
      slideIndex: index + 1,
      occupied: true,
      campaignId: campaign.id,
      campaignLabel: campaign.title || campaign.storeName || campaign.id.slice(0, 8),
      creativeThumbUrl: campaign.imageUrl,
      applicantOrSource: sourceLabel(campaign),
      scheduleLabel: scheduleLabel(campaign),
      lifecycleLabel: {
        ko: adsOpsStatusLabel(status, true),
        en: adsOpsStatusLabel(status, false),
      },
      sortOrder: campaign.sortOrder,
      href: DELIVERY_AD_ADMIN_ROUTES.detail(campaign.id),
    };
  });
}

/**
 * HERO booking authority loader. The capacity gate and placement board share
 * STORE_BANNER_AD_CAMPAIGN_TABLE + HERO inventory junction/lifecycle semantics.
 */
export async function loadHeroPlacementSlots(
  sb: SupabaseClient
): Promise<HeroPlacementSlot[]> {
  const campaigns = await loadHeroOccupancyCampaigns(sb);
  return projectHeroPlacementSlots(campaigns);
}
