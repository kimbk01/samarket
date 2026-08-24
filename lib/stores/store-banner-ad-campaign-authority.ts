/**
 * CUT 5 — BANNER_AD campaign authority (stores_home_hero only).
 * NOT store_paid_ad_campaigns / store_banners / feed_ad_campaigns / my_page_banners.
 */

export const STORE_BANNER_AD_CAMPAIGN_TABLE = "store_banner_ad_campaigns" as const;

export const STORE_BANNER_AD_SURFACES = ["stores_home_hero"] as const;
export type StoreBannerAdSurface = (typeof STORE_BANNER_AD_SURFACES)[number];

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
  return value === "stores_home_hero";
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
