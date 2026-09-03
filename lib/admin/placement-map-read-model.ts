/**
 * CUT F — Full App Placement Map read model.
 * ADAPTER_OVER_SEPARATE_REGISTRIES: normalize for Admin inspect only.
 * No unified placement DB. No mutation ownership.
 */

import {
  DELIVERY_AD_INVENTORY_KEYS,
  DELIVERY_AD_INVENTORY_SEEDS,
  inventorySeedByKey,
  isRuntimeActiveInventory,
  type DeliveryAdInventoryKey,
} from "@/lib/stores/advertising/delivery-ad-inventory";
import { isLaunchSellableInventoryKey } from "@/lib/stores/advertising/delivery-ad-launch-placement-product";
import { DELIVERY_AD_COMMERCIAL_INVENTORY_BY_PRODUCT } from "@/lib/stores/advertising/delivery-ad-commercial-contract";
import { deliveryAdPolicyScreenHref } from "@/lib/stores/advertising/delivery-ad-placement-language";
import { DELIVERY_AD_ADMIN_ROUTES } from "@/lib/stores/advertising/delivery-ad-routes";
import {
  DELIVERY_AD_PLACEMENT_PREVIEW_CONTRACT,
  type DeliveryAdPlacementPreviewSurface,
} from "@/lib/stores/advertising/delivery-ad-placement-preview";
import { STORES_SEARCH_TOP_LAUNCH } from "@/lib/stores/advertising/delivery-ad-product-recovery-contract";
import { CUT_J_DETAIL_INVENTORY_STATUS } from "@/lib/stores/advertising/delivery-ad-inventory";
import type { FeedAdPlacement } from "@/lib/ads/feed-ad-placement";
import { PLATFORM_POPUP_CONSUMER_SURFACES } from "@/lib/platform-popup/types";

export const PLACEMENT_MAP_ENTRY = "/admin/delivery-ads/inventory" as const;
export const PLACEMENT_MAP_HASH = "placement-map" as const;

export type PlacementMapDomain = "DELIVERY" | "FEED" | "POPUP";

export type PlacementMapScreen =
  | "DELIVERY_HOME"
  | "DELIVERY_CATEGORY"
  | "DELIVERY_SEARCH"
  | "STORE_DETAIL"
  | "TRADE_FEED"
  | "COMMUNITY_FEED"
  | "GLOBAL_POPUP";

/** Flags stay separate — never collapse into one “운영 가능”. */
export type PlacementMapFlags = {
  defined: true;
  sellable: boolean;
  runtimeSupported: boolean;
  previewSupported: boolean;
  commercialCatalog: boolean;
};

export type PlacementMapRow = {
  domain: PlacementMapDomain;
  screen: PlacementMapScreen;
  placementId: string;
  displayNameKo: string;
  displayNameEn: string;
  productKind: string;
  aspectRatio: string;
  ratioOwner: string;
  runtimeRouteHint: string;
  runtimeConsumer: string;
  adminController: string;
  configHref: string | null;
  opsHref: string;
  previewHref: string | null;
  flags: PlacementMapFlags;
  notes: string;
};

const PREVIEW_SURFACES = new Set<string>(
  Object.keys(DELIVERY_AD_PLACEMENT_PREVIEW_CONTRACT.visualOwners)
);

const COMMERCIAL_KEYS = new Set<string>([
  ...DELIVERY_AD_COMMERCIAL_INVENTORY_BY_PRODUCT.store_sponsored,
  ...DELIVERY_AD_COMMERCIAL_INVENTORY_BY_PRODUCT.banner,
]);

/** Proven runtime consumers (code paths) — not invented. */
const DELIVERY_RUNTIME_CONSUMER: Record<DeliveryAdInventoryKey, string> = {
  STORES_HOME_HERO: "StoresHomeHeroBanner / DeliveryAdBanner",
  STORES_HOME_FEED: "StoresHomeTimesaleRowCard insertion (HOME paid)",
  STORES_CATEGORY_FEED: "StoreBrowseCategoryRowCard insertion (BROWSE paid)",
  STORES_HOME_INLINE_1: "homeBannerBeforeRest (HOME composition slot)",
  STORES_CATEGORY_TOP: "browse category top banner slot (when enabled)",
  STORES_CATEGORY_INLINE: "FUTURE — no physical launch slot",
  STORES_SEARCH_TOP: "DeliverySearchResults ← loadStoresSearchTopBannerSlide",
  STORE_DETAIL_RECOMMENDATION_BANNER: "CUT_J BLOCKED — no runtime consumer",
};

const DELIVERY_SCREEN: Record<DeliveryAdInventoryKey, PlacementMapScreen> = {
  STORES_HOME_HERO: "DELIVERY_HOME",
  STORES_HOME_FEED: "DELIVERY_HOME",
  STORES_HOME_INLINE_1: "DELIVERY_HOME",
  STORES_CATEGORY_FEED: "DELIVERY_CATEGORY",
  STORES_CATEGORY_TOP: "DELIVERY_CATEGORY",
  STORES_CATEGORY_INLINE: "DELIVERY_CATEGORY",
  STORES_SEARCH_TOP: "DELIVERY_SEARCH",
  STORE_DETAIL_RECOMMENDATION_BANNER: "STORE_DETAIL",
};

const DELIVERY_DISPLAY: Record<
  DeliveryAdInventoryKey,
  { ko: string; en: string; route: string }
> = {
  STORES_HOME_HERO: {
    ko: "배달 홈 · 상단 배너",
    en: "Delivery Home · Top hero",
    route: "/stores (HOME hero)",
  },
  STORES_HOME_FEED: {
    ko: "배달 홈 · 매장 목록 광고",
    en: "Delivery Home · Store list ads",
    route: "/stores (HOME feed)",
  },
  STORES_HOME_INLINE_1: {
    ko: "배달 홈 · 인라인 배너",
    en: "Delivery Home · Inline banner",
    route: "/stores (before rest_stores)",
  },
  STORES_CATEGORY_FEED: {
    ko: "업종별 목록 · 매장 광고",
    en: "Category browse · Store ads",
    route: "/stores browse",
  },
  STORES_CATEGORY_TOP: {
    ko: "업종별 목록 · 상단 배너",
    en: "Category browse · Top banner",
    route: "/stores browse top",
  },
  STORES_CATEGORY_INLINE: {
    ko: "업종별 목록 · 인라인 (미래)",
    en: "Category browse · Inline (future)",
    route: "FUTURE",
  },
  STORES_SEARCH_TOP: {
    ko: "검색 결과 · 상단 광고",
    en: "Search results · Top banner",
    route: "/stores search",
  },
  STORE_DETAIL_RECOMMENDATION_BANNER: {
    ko: "매장 상세 · 추천 배너 (차단)",
    en: "Store detail · Recommendation (blocked)",
    route: "STORE DETAIL — blocked",
  },
};

function deliveryOpsHref(key: DeliveryAdInventoryKey): string {
  return `${DELIVERY_AD_ADMIN_ROUTES.hub}?view=actionable&inventory=${encodeURIComponent(key)}`;
}

function deliveryPreviewHref(key: DeliveryAdInventoryKey): string | null {
  if (!PREVIEW_SURFACES.has(key)) return null;
  return `${PLACEMENT_MAP_ENTRY}?focus=${encodeURIComponent(key)}#${PLACEMENT_MAP_HASH}`;
}

export function listDeliveryPlacementMapRows(): PlacementMapRow[] {
  return DELIVERY_AD_INVENTORY_KEYS.map((key) => {
    const seed = inventorySeedByKey(key);
    const display = DELIVERY_DISPLAY[key];
    const sellable = isLaunchSellableInventoryKey(key);
    const runtimeSupported =
      key === "STORE_DETAIL_RECOMMENDATION_BANNER"
        ? false
        : key === "STORES_CATEGORY_INLINE"
          ? false
          : isRuntimeActiveInventory(key);
    const previewSupported = PREVIEW_SURFACES.has(key);
    let notes = seed.notes;
    if (key === "STORES_SEARCH_TOP") {
      notes = `${notes} · launch=${STORES_SEARCH_TOP_LAUNCH.launchStatus} (runtime consumer kept)`;
    }
    if (key === "STORE_DETAIL_RECOMMENDATION_BANNER") {
      notes = `${notes} · ${CUT_J_DETAIL_INVENTORY_STATUS.state}`;
    }
    return {
      domain: "DELIVERY" as const,
      screen: DELIVERY_SCREEN[key],
      placementId: key,
      displayNameKo: display.ko,
      displayNameEn: display.en,
      productKind: seed.productKind,
      aspectRatio: `${seed.aspectRatioWidth}:${seed.aspectRatioHeight}`,
      ratioOwner: "lib/stores/advertising/delivery-ad-inventory.ts",
      runtimeRouteHint: display.route,
      runtimeConsumer: DELIVERY_RUNTIME_CONSUMER[key],
      adminController: PLACEMENT_MAP_ENTRY,
      configHref: deliveryAdPolicyScreenHref(key),
      opsHref: deliveryOpsHref(key),
      previewHref: deliveryPreviewHref(key),
      flags: {
        defined: true,
        sellable,
        runtimeSupported,
        previewSupported,
        commercialCatalog: COMMERCIAL_KEYS.has(key),
      },
      notes,
    };
  });
}

const FEED_PLACEMENTS: readonly {
  id: FeedAdPlacement;
  screen: PlacementMapScreen;
  ko: string;
  en: string;
  route: string;
  consumer: string;
}[] = [
  {
    id: "TRADE_HOME",
    screen: "TRADE_FEED",
    ko: "거래 홈 · 피드 배너",
    en: "Trade home · Feed banner",
    route: "/market (trade feed)",
    consumer: "FeedAdBannerCarousel ← GET /api/feed-ads/active",
  },
  {
    id: "TRADE_CATEGORY",
    screen: "TRADE_FEED",
    ko: "거래 카테고리 · 피드 배너",
    en: "Trade category · Feed banner",
    route: "/market category",
    consumer: "FeedAdBannerCarousel (TRADE_CATEGORY)",
  },
  {
    id: "COMMUNITY_HOME",
    screen: "COMMUNITY_FEED",
    ko: "커뮤니티 홈 · 피드 배너",
    en: "Community home · Feed banner",
    route: "/philife ALL → COMMUNITY_HOME",
    consumer: "CommunityFeed / FeedAdBannerCarousel",
  },
  {
    id: "COMMUNITY_TOPIC",
    screen: "COMMUNITY_FEED",
    ko: "커뮤니티 토픽 · 피드 배너",
    en: "Community topic · Feed banner",
    route: "/philife TOPIC",
    consumer: "CommunityFeed (topic pool)",
  },
];

export function listFeedPlacementMapRows(): PlacementMapRow[] {
  return FEED_PLACEMENTS.map((p) => ({
    domain: "FEED" as const,
    screen: p.screen,
    placementId: p.id,
    displayNameKo: p.ko,
    displayNameEn: p.en,
    productKind: "feed_banner",
    aspectRatio: "card-rhythm (feed-ad geometry SSOT)",
    ratioOwner: "lib/ads/feed-ad-placement.ts + feed banner product lock",
    runtimeRouteHint: p.route,
    runtimeConsumer: p.consumer,
    adminController: "/admin/feed-ad-requests",
    configHref: "/admin/feed-ad-products",
    opsHref: "/admin/feed-ad-requests",
    previewHref: null,
    flags: {
      defined: true,
      sellable: true,
      runtimeSupported: true,
      previewSupported: false,
      commercialCatalog: true,
    },
    notes: "Separate authority from Delivery — do not merge registries",
  }));
}

export function listPopupPlacementMapRows(): PlacementMapRow[] {
  return PLATFORM_POPUP_CONSUMER_SURFACES.map((surface) => ({
    domain: "POPUP" as const,
    screen: "GLOBAL_POPUP" as const,
    placementId: surface,
    displayNameKo: `플랫폼 팝업 · ${surface}`,
    displayNameEn: `Platform popup · ${surface}`,
    productKind: "platform_popup",
    aspectRatio: "popup surface contract",
    ratioOwner: "lib/platform-popup/*",
    runtimeRouteHint: `surface=${surface}`,
    runtimeConsumer: "platform-popup runtime loader (surface filter)",
    adminController: "/admin/platform-popup",
    configHref: "/admin/platform-popup",
    opsHref: "/admin/platform-popup",
    previewHref: null,
    flags: {
      defined: true,
      sellable: true,
      /** Code path exists; Production live proof remains NOT_PROVEN (CUT I). */
      runtimeSupported: true,
      /** Placement Map does not host a popup preview miniature. */
      previewSupported: false,
      commercialCatalog: true,
    },
    notes: "Domain separate from Delivery/Feed. Production live = NOT_PROVEN until CUT I.",
  }));
}

export function listAllPlacementMapRows(): PlacementMapRow[] {
  return [
    ...listDeliveryPlacementMapRows(),
    ...listFeedPlacementMapRows(),
    ...listPopupPlacementMapRows(),
  ];
}

export function placementMapFocusHref(placementId: string): string {
  const id = placementId.trim();
  if (!id) return `${PLACEMENT_MAP_ENTRY}#${PLACEMENT_MAP_HASH}`;
  return `${PLACEMENT_MAP_ENTRY}?focus=${encodeURIComponent(id)}#${PLACEMENT_MAP_HASH}`;
}

export function filterPlacementMapRows(
  rows: readonly PlacementMapRow[],
  input: { domain?: PlacementMapDomain | "ALL"; screen?: PlacementMapScreen | "ALL" }
): PlacementMapRow[] {
  return rows.filter((r) => {
    if (input.domain && input.domain !== "ALL" && r.domain !== input.domain) return false;
    if (input.screen && input.screen !== "ALL" && r.screen !== input.screen) return false;
    return true;
  });
}

/** Contract: every Delivery preview surface key must exist in inventory registry. */
export function assertDeliveryPreviewKeysInRegistry(): {
  ok: boolean;
  unknown: string[];
} {
  const unknown: string[] = [];
  for (const key of Object.keys(DELIVERY_AD_PLACEMENT_PREVIEW_CONTRACT.visualOwners)) {
    if (!(DELIVERY_AD_INVENTORY_KEYS as readonly string[]).includes(key)) {
      unknown.push(key);
    }
  }
  return { ok: unknown.length === 0, unknown };
}

/** Contract: inventory seeds cover all registry keys (no orphan preview invent). */
export function assertInventorySeedsCoverRegistry(): {
  ok: boolean;
  missing: string[];
} {
  const seeded = new Set(DELIVERY_AD_INVENTORY_SEEDS.map((s) => s.key));
  const missing = DELIVERY_AD_INVENTORY_KEYS.filter((k) => !seeded.has(k));
  return { ok: missing.length === 0, missing: [...missing] };
}

export function isDeliveryPreviewSurface(
  key: string
): key is DeliveryAdPlacementPreviewSurface {
  return PREVIEW_SURFACES.has(key);
}
