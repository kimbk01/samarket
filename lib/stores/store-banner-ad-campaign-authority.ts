/**
 * CUT 5 / CUT J — BANNER_AD campaign authority
 * (stores_home_hero + stores_search).
 * NOT store_paid_ad_campaigns / store_banners / feed_ad_campaigns / my_page_banners.
 *
 * CUT A HARD LOCK:
 * store_banner_ad_campaigns = BANNER_AD = image creative Delivery banner campaign.
 *
 * @see lib/stores/advertising
 */

import { BANNER_AD_CAMPAIGN_TABLE } from "@/lib/stores/advertising/delivery-ad-domain";
import {
  BANNER_AD_DB_SURFACES,
  type BannerAdDbSurface,
} from "@/lib/stores/advertising/delivery-ad-placement";

export const STORE_BANNER_AD_CAMPAIGN_TABLE = BANNER_AD_CAMPAIGN_TABLE;

export const STORE_BANNER_AD_SURFACES = BANNER_AD_DB_SURFACES;
export type StoreBannerAdSurface = BannerAdDbSurface;

export type StoreBannerAdCampaignRow = {
  id: string;
  surface: StoreBannerAdSurface;
  title: string | null;
  subtitle: string | null;
  imageUrl: string;
  /** Canonical deeplink as stored — empty = no navigation. */
  ctaHref: string;
  sortOrder: number;
  startAt: string;
  endAt: string;
  isActive: boolean;
};

export function isStoreBannerAdSurface(value: unknown): value is StoreBannerAdSurface {
  return (
    typeof value === "string" &&
    (STORE_BANNER_AD_SURFACES as readonly string[]).includes(value)
  );
}

export function isStoreBannerAdCreativeValid(
  row: Pick<StoreBannerAdCampaignRow, "imageUrl">
): boolean {
  return String(row.imageUrl ?? "").trim().length > 0;
}

export function isStoreBannerAdWindowActive(
  row: Pick<StoreBannerAdCampaignRow, "startAt" | "endAt">,
  nowMs: number = Date.now()
): boolean {
  const startMs = Date.parse(row.startAt);
  const endMs = Date.parse(row.endAt);
  if (!Number.isFinite(startMs) || !Number.isFinite(endMs) || endMs <= startMs) return false;
  return startMs <= nowMs && endMs > nowMs;
}

export function isStoreBannerAdCampaignActive(
  row: Pick<StoreBannerAdCampaignRow, "isActive" | "startAt" | "endAt" | "imageUrl">,
  nowMs: number = Date.now()
): boolean {
  if (!row.isActive) return false;
  if (!isStoreBannerAdCreativeValid(row)) return false;
  return isStoreBannerAdWindowActive(row, nowMs);
}

/**
 * Deterministic order — schema sort_order ASC → start_at DESC → id ASC.
 */
export function compareStoreBannerAdCampaigns(
  a: Pick<StoreBannerAdCampaignRow, "id" | "sortOrder" | "startAt">,
  b: Pick<StoreBannerAdCampaignRow, "id" | "sortOrder" | "startAt">
): number {
  if (a.sortOrder !== b.sortOrder) return a.sortOrder - b.sortOrder;
  const aStart = Date.parse(a.startAt);
  const bStart = Date.parse(b.startAt);
  if (aStart !== bStart) return bStart - aStart;
  return a.id.localeCompare(b.id);
}
