/**
 * DIBAY open-event commercial launch guidance (copy + creative geometry).
 * Package pesos live in DB (`delivery_ad_packages`) — not duplicated here as price authority.
 * Catalog edits must not mutate existing campaign commercial snapshots.
 */

import type { OwnerBannerInventoryKey } from "@/lib/stores/advertising/owner-banner-contract";

export const DELIVERY_AD_OPEN_EVENT_COMMERCIAL = {
  labelKo: "오픈 이벤트 가격",
  labelEn: "Open-event pricing",
  changeableKo: "향후 Admin에서 변경할 수 있습니다.",
  changeableEn: "Admins can change these prices later.",
  grandfatherKo: "이미 승인된 광고의 가격은 승인 당시 금액으로 유지됩니다.",
  grandfatherEn: "Approved campaigns keep the price frozen at approval (commercial snapshot).",
  reason: "dibay_open_event_sample_seed",
} as const;

/** PHP major → stored as minor (×100) in delivery_ad_packages.price_amount_minor */
export const DELIVERY_AD_OPEN_EVENT_PACKAGE_PRICES_PHP_MAJOR = {
  store_sponsored: {
    STORES_HOME_FEED: { 7: 120, 15: 220, 30: 390 },
    STORES_CATEGORY_FEED: { 7: 100, 15: 180, 30: 320 },
  },
  banner: {
    STORES_HOME_HERO: { 7: 350, 15: 650, 30: 1100 },
    STORES_SEARCH_TOP: { 7: 250, 15: 450, 30: 790 },
  },
} as const;

export const DELIVERY_AD_OPEN_EVENT_PARTNER = {
  monthlyFeePhpMajor: 120,
  advertisingDiscountPercent: 15,
} as const;

export type BannerCreativePixelGuide = {
  inventoryKey: OwnerBannerInventoryKey;
  ratioLabel: string;
  recommendedWidth: number;
  recommendedHeight: number;
  minWidth: number;
  minHeight: number;
  safeAreaNoteKo: string;
  safeAreaNoteEn: string;
  objectFit: "cover";
};

/**
 * Product geometry for Owner/Admin guidance.
 * Aspect matches inventory SSOT (39:16 / 3:1); pixels are launch recommendations.
 */
export const DELIVERY_AD_BANNER_PIXEL_GUIDE: Record<
  OwnerBannerInventoryKey,
  BannerCreativePixelGuide
> = {
  STORES_HOME_HERO: {
    inventoryKey: "STORES_HOME_HERO",
    ratioLabel: "39:16",
    recommendedWidth: 1560,
    recommendedHeight: 640,
    minWidth: 1170,
    minHeight: 480,
    safeAreaNoteKo: "중요 텍스트·로고는 중앙 80% 안쪽에 배치하세요.",
    safeAreaNoteEn: "Keep critical text/logo inside the center 80% safe area.",
    objectFit: "cover",
  },
  STORES_SEARCH_TOP: {
    inventoryKey: "STORES_SEARCH_TOP",
    ratioLabel: "3:1",
    recommendedWidth: 1200,
    recommendedHeight: 400,
    minWidth: 900,
    minHeight: 300,
    safeAreaNoteKo: "중요 텍스트·로고는 중앙 80% 안쪽에 배치하세요.",
    safeAreaNoteEn: "Keep critical text/logo inside the center 80% safe area.",
    objectFit: "cover",
  },
};

export function bannerPixelGuideForInventory(
  key: string
): BannerCreativePixelGuide | null {
  if (key === "STORES_HOME_HERO" || key === "STORES_SEARCH_TOP") {
    return DELIVERY_AD_BANNER_PIXEL_GUIDE[key];
  }
  return null;
}

export function formatBannerPixelGuideLine(
  guide: BannerCreativePixelGuide,
  lang: "ko" | "en"
): string {
  const rec = `${guide.recommendedWidth}×${guide.recommendedHeight}`;
  const min = `${guide.minWidth}×${guide.minHeight}`;
  if (lang === "en") {
    return `${guide.ratioLabel} · recommended ${rec} · min ${min}`;
  }
  return `${guide.ratioLabel} · 권장 ${rec} · 최소 ${min}`;
}

export type OwnerBannerCreativePrepMode = "owner_upload" | "admin_produce";

export function isOwnerBannerCreativePrepMode(
  value: unknown
): value is OwnerBannerCreativePrepMode {
  return value === "owner_upload" || value === "admin_produce";
}

export function countUnsetSellablePackageSlots(input: {
  packages: Array<{ priceAmountMinor: number | null; enabled: boolean }>;
}): number {
  return input.packages.filter(
    (p) => p.priceAmountMinor == null || p.priceAmountMinor <= 0 || !p.enabled
  ).length;
}
