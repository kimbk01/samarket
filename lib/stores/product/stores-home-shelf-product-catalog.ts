/**
 * Product recovery — HOME shelf catalog (Owner language SSOT).
 * Composer slot mapping only; does NOT invent ranking/metrics.
 */

import type { StoresHomeCompositionSlotKey } from "@/lib/stores/composition/stores-composition-home-slots";
import type { StoresHomePresentationPatternId } from "@/lib/stores/presentation/stores-home-presentation-spec";
import type {
  StoresHomeShelfEntityType,
  StoresHomeShelfProductConfig,
  StoresHomeShelfShowAllRouteKey,
} from "@/lib/stores/product/stores-home-shelf-product-config";
import { STORES_HOME_SHELF_DEFAULT_PRODUCT_CONFIG } from "@/lib/stores/product/stores-home-shelf-product-config";

function shelfDefaults(partial: Partial<StoresHomeShelfProductConfig>): StoresHomeShelfProductConfig {
  return { ...STORES_HOME_SHELF_DEFAULT_PRODUCT_CONFIG, ...partial };
}

export type StoresHomeShelfAvailability = "available" | "partial" | "unavailable";

export type StoresHomeShelfCouponIntegration = "off" | "badge_on_image" | "benefit_line" | "both";
export type StoresHomeShelfAdIntegration = "off" | "sponsored_badge" | "benefit_line" | "both";

export type StoresHomeShelfProductDefinition = {
  /** Owner-facing stable id — never expose composer slot ids in Admin UI */
  shelfId: string;
  /** Internal composer slot; absent when unavailable (no customer render) */
  composerSlot?: StoresHomeCompositionSlotKey;
  defaultTitleKo: string;
  defaultTitleEn: string;
  defaultSubtitleKo?: string;
  defaultSubtitleEn?: string;
  availability: StoresHomeShelfAvailability;
  unavailableReasonKo?: string;
  unavailableReasonEn?: string;
  defaultPresentation: StoresHomePresentationPatternId;
  defaultMax: number | null;
  defaultOrder: number;
  defaultProductConfig: StoresHomeShelfProductConfig;
  supportsCouponIntegration: boolean;
  supportsAdIntegration: boolean;
  dataAuthorityNote: string;
};

/** Ordered HOME shelf catalog — Admin + customer title defaults */
export const STORES_HOME_SHELF_PRODUCT_CATALOG: readonly StoresHomeShelfProductDefinition[] = [
  {
    shelfId: "order_now",
    composerSlot: "slot0Food",
    defaultTitleKo: "지금 주문 가능",
    defaultTitleEn: "Order now",
    defaultSubtitleKo: "영업 중 · 배달 또는 포장이 열려 있어요",
    defaultSubtitleEn: "Open · delivery or pickup available",
    availability: "available",
    defaultPresentation: "food_horizontal",
    defaultMax: 16,
    defaultOrder: 0,
    defaultProductConfig: shelfDefaults({
      entityType: "product",
      showAllEnabled: true,
      showAllRouteKey: "orderNow",
      imageSource: "representative_product",
      benefitLineMode: "delivery_discount",
    }),
    supportsCouponIntegration: true,
    supportsAdIntegration: true,
    dataAuthorityNote: "open + deliveryAvailable → owner representative product",
  },
  {
    shelfId: "main_stores",
    composerSlot: "slot1Stores",
    defaultTitleKo: "매장",
    defaultTitleEn: "Stores",
    availability: "available",
    defaultPresentation: "timesale_vertical",
    defaultMax: null,
    defaultOrder: 1,
    defaultProductConfig: shelfDefaults({
      entityType: "store",
      showAllEnabled: true,
      showAllRouteKey: "allStores",
      imageSource: "store_profile",
    }),
    supportsCouponIntegration: true,
    supportsAdIntegration: true,
    dataAuthorityNote: "Discovery API order minus Slot0 stores",
  },
  {
    shelfId: "popular",
    composerSlot: "slot2Food",
    defaultTitleKo: "많이 주문하는 맛집",
    defaultTitleEn: "Most ordered restaurants",
    availability: "available",
    defaultPresentation: "store_horizontal",
    defaultMax: 20,
    defaultOrder: 2,
    defaultProductConfig: shelfDefaults({
      entityType: "store",
      showAllEnabled: true,
      showAllRouteKey: "popular",
      imageSource: "store_profile",
      reviewSnippetMode: "rating_with_count",
    }),
    supportsCouponIntegration: true,
    supportsAdIntegration: true,
    dataAuthorityNote: "completedOrderCount30d > 0 · sortStoreDiscoveryPopularRows",
  },
  {
    shelfId: "delivery_fee_discount",
    composerSlot: "slot3Food",
    defaultTitleKo: "배달팁 할인",
    defaultTitleEn: "Delivery fee discount",
    defaultSubtitleKo: "배달비 할인 혜택이 있는 매장",
    defaultSubtitleEn: "Stores with delivery fee discount evidence",
    availability: "partial",
    defaultPresentation: "timesale_vertical",
    defaultMax: 20,
    defaultOrder: 5,
    defaultProductConfig: shelfDefaults({
      entityType: "store",
      showAllEnabled: true,
      showAllRouteKey: "discount",
      imageSource: "store_profile",
      benefitLineMode: "delivery_discount",
    }),
    supportsCouponIntegration: true,
    supportsAdIntegration: true,
    dataAuthorityNote:
      "deliveryFeeStrikePhp evidence only — NOT zero-tip authority. Rename to 배달팁 0원 only when zero-fee canonical field exists.",
  },
  {
    shelfId: "high_rating",
    composerSlot: "slot4Food",
    defaultTitleKo: "평점 높은 가게",
    defaultTitleEn: "Highly rated stores",
    availability: "available",
    defaultPresentation: "store_horizontal",
    defaultMax: 20,
    defaultOrder: 6,
    defaultProductConfig: shelfDefaults({
      entityType: "store",
      showAllEnabled: true,
      showAllRouteKey: "topRated",
      imageSource: "representative_product",
      reviewSnippetMode: "rating_with_count",
    }),
    supportsCouponIntegration: true,
    supportsAdIntegration: true,
    dataAuthorityNote: "rating ≥ 4 AND reviewCount ≥ 3",
  },
  {
    shelfId: "fast_arrival",
    composerSlot: "slot6NearbyStores",
    defaultTitleKo: "금방 도착",
    defaultTitleEn: "Arrives fast",
    defaultSubtitleKo: "가까운 매장부터 보여 드려요",
    defaultSubtitleEn: "Sorted by distance",
    availability: "available",
    defaultPresentation: "timesale_vertical",
    defaultMax: 24,
    defaultOrder: 8,
    defaultProductConfig: shelfDefaults({
      entityType: "store",
      showAllEnabled: true,
      showAllRouteKey: "nearby",
      imageSource: "store_profile",
    }),
    supportsCouponIntegration: true,
    supportsAdIntegration: true,
    dataAuthorityNote: "distanceKm ASC within final-row exclude set",
  },
  {
    shelfId: "new_store",
    composerSlot: "newStoreFood",
    defaultTitleKo: "신규 매장",
    defaultTitleEn: "Newly opened",
    availability: "available",
    defaultPresentation: "store_teaser_horizontal",
    defaultMax: 20,
    defaultOrder: 3,
    defaultProductConfig: shelfDefaults({
      entityType: "store",
      showAllEnabled: false,
      showAllRouteKey: "none",
      imageSource: "representative_product",
      badgeMode: "standard",
    }),
    supportsCouponIntegration: true,
    supportsAdIntegration: true,
    dataAuthorityNote: "firstListedAt new-store signal · firstListedAt DESC",
  },
  {
    shelfId: "promo_campaign",
    composerSlot: "campaignFood",
    defaultTitleKo: "할인/프로모션",
    defaultTitleEn: "Discounts & promos",
    availability: "available",
    defaultPresentation: "brand_circular",
    defaultMax: 20,
    defaultOrder: 4,
    defaultProductConfig: shelfDefaults({
      entityType: "brand",
      showAllEnabled: false,
      showAllRouteKey: "none",
      imageSource: "brand_logo",
      benefitLineMode: "campaign",
    }),
    supportsCouponIntegration: true,
    supportsAdIntegration: true,
    dataAuthorityNote: "store.discoveryCampaign active (W Campaign backend)",
  },
  {
    shelfId: "recommended",
    composerSlot: "slot5Food",
    defaultTitleKo: "추천",
    defaultTitleEn: "Recommended",
    availability: "available",
    defaultPresentation: "editorial_grid",
    defaultMax: 8,
    defaultOrder: 7,
    defaultProductConfig: shelfDefaults({
      entityType: "store",
      showAllEnabled: true,
      showAllRouteKey: "recommended",
      imageSource: "representative_product",
    }),
    supportsCouponIntegration: true,
    supportsAdIntegration: true,
    dataAuthorityNote: "isFeatured filter",
  },
  {
    shelfId: "rest_stores",
    composerSlot: "slot6RestStores",
    defaultTitleKo: "더 많은 매장",
    defaultTitleEn: "More stores",
    availability: "available",
    defaultPresentation: "timesale_vertical",
    defaultMax: null,
    defaultOrder: 9,
    defaultProductConfig: shelfDefaults({
      entityType: "store",
      showAllEnabled: true,
      showAllRouteKey: "allStores",
      imageSource: "store_profile",
    }),
    supportsCouponIntegration: true,
    supportsAdIntegration: true,
    dataAuthorityNote: "Discovery pool remainder · API order preserved",
  },
  {
    shelfId: "praise_reviews",
    defaultTitleKo: "칭찬 리뷰 많은 가게",
    defaultTitleEn: "Most praised reviews",
    availability: "unavailable",
    unavailableReasonKo: "칭찬 리뷰 집계 데이터 authority가 아직 없습니다. ranking/metric을 새로 만들지 않습니다.",
    unavailableReasonEn: "Praise-review metric authority does not exist yet. No invented ranking.",
    defaultPresentation: "preserved_legacy",
    defaultMax: null,
    defaultOrder: 10,
    defaultProductConfig: shelfDefaults({ entityType: "store", showAllEnabled: false, showAllRouteKey: "none" }),
    supportsCouponIntegration: false,
    supportsAdIntegration: false,
    dataAuthorityNote: "UNAVAILABLE — no composer slot",
  },
  {
    shelfId: "queue_popular",
    defaultTitleKo: "줄 서는 맛집",
    defaultTitleEn: "Popular queues",
    availability: "unavailable",
    unavailableReasonKo: "대기/줄서기 metric authority가 아직 없습니다.",
    unavailableReasonEn: "Queue/wait metric authority does not exist yet.",
    defaultPresentation: "preserved_legacy",
    defaultMax: null,
    defaultOrder: 11,
    defaultProductConfig: shelfDefaults({ entityType: "store", showAllEnabled: false, showAllRouteKey: "none" }),
    supportsCouponIntegration: false,
    supportsAdIntegration: false,
    dataAuthorityNote: "UNAVAILABLE — no composer slot",
  },
  {
    shelfId: "timesale_countdown",
    defaultTitleKo: "타임세일",
    defaultTitleEn: "Timesale",
    availability: "unavailable",
    unavailableReasonKo: "타임세일 종료 시각(end_at) authority가 아직 없습니다. 카운트다운 UI만 만들지 않습니다.",
    unavailableReasonEn: "Timesale end_at authority does not exist yet. No countdown-only UI.",
    defaultPresentation: "preserved_legacy",
    defaultMax: null,
    defaultOrder: 12,
    defaultProductConfig: shelfDefaults({ entityType: "product", showAllEnabled: false, showAllRouteKey: "none" }),
    supportsCouponIntegration: false,
    supportsAdIntegration: false,
    dataAuthorityNote: "UNAVAILABLE — no composer slot",
  },
] as const;

export type StoresHomeShelfId = (typeof STORES_HOME_SHELF_PRODUCT_CATALOG)[number]["shelfId"];

const BY_SHELF_ID = new Map(
  STORES_HOME_SHELF_PRODUCT_CATALOG.map((s) => [s.shelfId, s] as const)
);

const BY_COMPOSER_SLOT = new Map(
  STORES_HOME_SHELF_PRODUCT_CATALOG.filter((s) => s.composerSlot != null).map(
    (s) => [s.composerSlot!, s] as const
  )
);

export function storesHomeShelfById(shelfId: string): StoresHomeShelfProductDefinition | undefined {
  return BY_SHELF_ID.get(shelfId as StoresHomeShelfId);
}

export function storesHomeShelfByComposerSlot(
  slot: StoresHomeCompositionSlotKey
): StoresHomeShelfProductDefinition | undefined {
  return BY_COMPOSER_SLOT.get(slot);
}

/** Customer HOME — unavailable shelves never render */
export function storesHomeCustomerVisibleShelves(): readonly StoresHomeShelfProductDefinition[] {
  return STORES_HOME_SHELF_PRODUCT_CATALOG.filter((s) => s.availability !== "unavailable" && s.composerSlot);
}

export function composerSlotToShelfId(slot: StoresHomeCompositionSlotKey): string {
  return storesHomeShelfByComposerSlot(slot)?.shelfId ?? slot;
}

export function shelfIdToComposerSlot(shelfId: string): StoresHomeCompositionSlotKey | null {
  const def = storesHomeShelfById(shelfId);
  return def?.composerSlot ?? null;
}
