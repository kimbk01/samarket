/**
 * Stage 2 — Customer physical inventory authority (HOME + PRIMARY + SECONDARY).
 * PHYSICAL SLOT ≠ commercial sellable product.
 * Admin HOME composition + BROWSE category policy own positions.
 * Stage 1 finance HARD LOCK — do not import spend/refund writers here.
 */

import type { DeliveryAdInventoryKey } from "@/lib/stores/advertising/delivery-ad-inventory";
import { BANNER_PLACEMENT_CAPACITY_SSOT } from "@/lib/ads/banner-placement-capacity-ssot";

export const DELIVERY_AD_STAGE2_SURFACE_CONTRACT = {
  id: "delivery_ad_stage2_customer_physical_inventory" as const,
  stage1Finance: "HARD_LOCKED" as const,
  searchTop: "NOT_SELLABLE" as const,
  legacyBusinessCash: "LEGACY_READ_ONLY" as const,
} as const;

/** Content-column geometry SSOT (StoresHomeHub / browse share max-w-[768px] + --delivery-page-x 16px). */
export const DELIVERY_AD_STAGE2_CONTENT_COLUMN = {
  maxWidthPx: 768,
  pagePaddingXPx: 16,
  widths: {
    375: 375 - 32,
    390: 390 - 32,
    430: 430 - 32,
    768: 768 - 32,
    820: 768 - 32, // capped by max-w-[768px]
  },
} as const;

export type DeliveryAdStage2Viewport = 375 | 390 | 430 | 768 | 820;

export function stage2ContentInnerWidth(viewport: DeliveryAdStage2Viewport): number {
  return DELIVERY_AD_STAGE2_CONTENT_COLUMN.widths[viewport];
}

/** Banner geometry derived from measured content column (not SEARCH 3:1 / not blind HERO 39:16). */
export type DeliveryAdStage2BannerGeometry = {
  inventoryKey: DeliveryAdInventoryKey;
  aspectW: number;
  aspectH: number;
  ratioLabel: string;
  recommendedWidth: number;
  recommendedHeight: number;
  minimumWidth: number;
  minimumHeight: number;
  maxBytes: number;
  objectFit: "cover";
  cropPolicy: "cover";
  textSafeArea: { topPct: number; rightPct: number; bottomPct: number; leftPct: number };
  rotation: "single" | "carousel";
  continuation: "fixed_once_per_surface" | "hero_carousel";
  measuredInnerWidths: Record<DeliveryAdStage2Viewport, number>;
};

export const STAGE2_HOME_HERO_GEOMETRY: DeliveryAdStage2BannerGeometry = {
  inventoryKey: "STORES_HOME_HERO",
  aspectW: 39,
  aspectH: 16,
  ratioLabel: "39:16",
  recommendedWidth: 1560,
  recommendedHeight: 640,
  minimumWidth: 1170,
  minimumHeight: 480,
  maxBytes: 2_000_000,
  objectFit: "cover",
  cropPolicy: "cover",
  textSafeArea: { topPct: 8, rightPct: 6, bottomPct: 12, leftPct: 6 },
  rotation: "carousel",
  continuation: "hero_carousel",
  measuredInnerWidths: { ...DELIVERY_AD_STAGE2_CONTENT_COLUMN.widths },
};

/** HOME before-rest banner — 2:1 from content column (FUTURE seed activated). */
export const STAGE2_HOME_BEFORE_REST_GEOMETRY: DeliveryAdStage2BannerGeometry = {
  inventoryKey: "STORES_HOME_INLINE_1",
  aspectW: 2,
  aspectH: 1,
  ratioLabel: "2:1",
  recommendedWidth: 1536,
  recommendedHeight: 768,
  minimumWidth: 686,
  minimumHeight: 343,
  maxBytes: 1_500_000,
  objectFit: "cover",
  cropPolicy: "cover",
  textSafeArea: { topPct: 10, rightPct: 8, bottomPct: 14, leftPct: 8 },
  rotation: "single",
  continuation: "fixed_once_per_surface",
  measuredInnerWidths: { ...DELIVERY_AD_STAGE2_CONTENT_COLUMN.widths },
};

/** PRIMARY/SECONDARY browse top-context banner — same column width; not SEARCH 3:1. */
export const STAGE2_BROWSE_TOP_GEOMETRY: DeliveryAdStage2BannerGeometry = {
  inventoryKey: "STORES_CATEGORY_TOP",
  aspectW: 2,
  aspectH: 1,
  ratioLabel: "2:1",
  recommendedWidth: 1536,
  recommendedHeight: 768,
  minimumWidth: 686,
  minimumHeight: 343,
  maxBytes: 1_500_000,
  objectFit: "cover",
  cropPolicy: "cover",
  textSafeArea: { topPct: 10, rightPct: 8, bottomPct: 14, leftPct: 8 },
  rotation: "single",
  continuation: "fixed_once_per_surface",
  measuredInnerWidths: { ...DELIVERY_AD_STAGE2_CONTENT_COLUMN.widths },
};

export const STAGE2_REJECTED_PHYSICAL_SLOTS = [
  {
    candidate: "STORES_CATEGORY_INLINE",
    reason: "every-N / inline boundary would invent parallel insertion without Admin-owned fixed composition boundary",
  },
  {
    candidate: "banner_every_home_shelf",
    reason: "per-shelf banners need individual Admin composition rows; Stage 2 ships one before-rest boundary first",
  },
  {
    candidate: "STORES_SEARCH_TOP",
    reason: "NOT_SELLABLE — not core discovery path",
  },
] as const;

export const STAGE2_HOME_PHYSICAL_ORDER = [
  "quick_categories",
  "HOME_HERO_banner",
  "organic_shelves",
  "HOME_BEFORE_REST_banner",
  "rest_stores_native",
] as const;

export const STAGE2_BROWSE_PHYSICAL_ORDER = [
  "taxonomy_header",
  "sort_filters",
  "BROWSE_TOP_banner",
  "mixed_list_organic_native_discovery",
] as const;

/** Composition policy slot for HOME Banner before rest_stores. */
export const STAGE2_HOME_BANNER_BEFORE_REST_SLOT = "homeBannerBeforeRest" as const;

/** Human labels (ko) — internal keys never shown as product copy. */
export const STAGE2_HUMAN_LABELS_KO = {
  STORES_HOME_HERO: "배달 홈 상단 배너",
  STORES_HOME_INLINE_1: "배달 홈 매장 목록 위 배너",
  STORES_CATEGORY_TOP: "업종 페이지 상단 배너",
  STORES_HOME_FEED: "배달 홈 매장 홍보",
  STORES_CATEGORY_FEED: "업종 매장 홍보",
} as const;

export type Stage2BannerAdsPolicy = {
  enabled: boolean;
  position: "top_context";
  capacity: number;
};

export const STAGE2_BANNER_ADS_DEFAULT: Stage2BannerAdsPolicy = {
  enabled: false,
  position: "top_context",
  capacity: 1,
};

/** 업종 상단 배너 — 한 번에 보이는 수 (B-3). 저장된 capacity 값과 무관하게 1. */
export const STAGE2_BROWSE_BANNER_VISIBLE_COUNT = 1;

/**
 * 재감사 R3 (B-3 마무리): 업종 상단 배너 예비 풀 — 서버가 등록 수용량(SSOT max)만큼 우선순위대로 내려 주고,
 * 앱은 첫 배너 1개만 그린다. 그 이미지가 깨지면 앱이 다음 배너로 넘어간다(빈칸 방지). 노출 기록은 실제로 보인
 * 배너만(`DeliveryAdBanner` 화면 노출 시)이라 예비 배너는 기록되지 않는다.
 */
export const STAGE2_BROWSE_BANNER_FALLBACK_POOL = BANNER_PLACEMENT_CAPACITY_SSOT.STORES_CATEGORY_TOP.max;

/**
 * 광고 최종 점검 B-3 (배달 홈 중간 배너): 업종 상단과 같은 예비 풀 — 서버가 등록 수용량(SSOT max)만큼
 * 고객이 볼 수 있는 배너(배달 범위 등)를 우선순위대로 내려 주고, 앱은 첫 배너 1개만 그린다. 첫 배너 이미지가
 * 깨지면 다음 배너로 넘어간다(`StoresHomeBeforeRestBanner` onAssetError). 노출 기록은 실제로 보인 배너만.
 */
export const STAGE2_HOME_BEFORE_REST_BANNER_FALLBACK_POOL =
  BANNER_PLACEMENT_CAPACITY_SSOT.STORES_HOME_INLINE_1.max;

/** 어드민 현황 칩 — 한 번에 보이는 배너 수 / 예비 포함 등록 수용량 (지면별 SSOT 값 그대로). */
export const STAGE2_SINGLE_BANNER_ADMIN_CAPACITY = {
  STORES_HOME_INLINE_1: {
    visibleAtOnce: BANNER_PLACEMENT_CAPACITY_SSOT.STORES_HOME_INLINE_1.visibleAtOnce,
    registrationMax: STAGE2_HOME_BEFORE_REST_BANNER_FALLBACK_POOL,
  },
  STORES_CATEGORY_TOP: {
    visibleAtOnce: STAGE2_BROWSE_BANNER_VISIBLE_COUNT,
    registrationMax: STAGE2_BROWSE_BANNER_FALLBACK_POOL,
  },
} as const;

export function bannerAdsFromProductConfig(
  cfg: Record<string, unknown> | null | undefined
): Stage2BannerAdsPolicy {
  if (!cfg || typeof cfg !== "object") return { ...STAGE2_BANNER_ADS_DEFAULT };
  const raw = cfg.bannerAds;
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) {
    return { ...STAGE2_BANNER_ADS_DEFAULT };
  }
  const o = raw as Record<string, unknown>;
  return {
    enabled: o.enabled === true,
    position: "top_context",
    /**
     * 광고 감사 B-3: 화면에 보이는 배너 수 = 1 고정(앱은 첫 배너 1개만 그림, 회전 없음).
     * 등록·승인 수용량(`BANNER_PLACEMENT_CAPACITY_SSOT.STORES_CATEGORY_TOP.max` = 3)은 별개 —
     * 첫 배너를 볼 수 없는 고객(배달 범위 밖 등)에게 다음 배너가 대신 나오는 예비 풀이다.
     */
    capacity: STAGE2_BROWSE_BANNER_VISIBLE_COUNT,
  };
}

export function withBannerAdsProductConfig(
  cfg: Record<string, unknown> | null | undefined,
  bannerAds: Stage2BannerAdsPolicy
): Record<string, unknown> {
  return { ...(cfg ?? {}), bannerAds };
}

/** Physical gate: commercial sellable cannot override disabled physical slot. */
export function stage2PhysicalBannerExposureAllowed(input: {
  physicalEnabled: boolean;
  commercialSellable: boolean;
  campaignEligible: boolean;
}): boolean {
  return input.physicalEnabled && input.commercialSellable && input.campaignEligible;
}

export const STAGE2_BANNER_CONTENT_MODEL = {
  STORES_HOME_HERO: "IMAGE_ONLY" as const,
  STORES_HOME_INLINE_1: "IMAGE_ONLY" as const,
  STORES_CATEGORY_TOP: "IMAGE_ONLY" as const,
};

export const STAGE2_BANNER_RENDERER = "DeliveryAdBanner" as const;
