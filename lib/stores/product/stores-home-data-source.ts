/**
 * HOME DATA SOURCE — existing composer membership ids only. No invented ranking.
 */

import type { StoreHomeFeedItem } from "@/lib/stores/store-home-feed-types";
import type { StoresHomePresentationPatternId } from "@/lib/stores/presentation/stores-home-presentation-spec";
import { isNewStoreSignal } from "@/lib/stores/store-new-store-signal";

export const STORES_HOME_DATA_SOURCE_IDS = [
  "order_now",
  "popular_menu",
  "new_store",
  "editorial_promo",
  "delivery_fee_benefit",
  "high_rating",
  "recommended",
  "rest_stores",
] as const;

export type StoresHomeDataSourceId = (typeof STORES_HOME_DATA_SOURCE_IDS)[number];

/** 「평점 높은 가게」 기준 — 홈 선반 판정 단일 정의 (기존 CUT3 기준값) */
export const STORES_HOME_TOP_RATED_MIN_RATING = 4;
export const STORES_HOME_TOP_RATED_MIN_REVIEWS = 3;

type HomePurposeOrRestSlot =
  | "slot0Food"
  | "slot2Food"
  | "newStoreFood"
  | "campaignFood"
  | "slot3Food"
  | "slot4Food"
  | "slot5Food"
  | "slot6RestStores";

export const STORES_HOME_SLOT_DEFAULT_DATA_SOURCE: Record<HomePurposeOrRestSlot, StoresHomeDataSourceId> = {
  slot0Food: "order_now",
  slot2Food: "popular_menu",
  newStoreFood: "new_store",
  campaignFood: "editorial_promo",
  slot3Food: "delivery_fee_benefit",
  slot4Food: "high_rating",
  slot5Food: "recommended",
  slot6RestStores: "rest_stores",
};

export function isStoresHomeDataSourceId(value: unknown): value is StoresHomeDataSourceId {
  return (
    typeof value === "string" &&
    (STORES_HOME_DATA_SOURCE_IDS as readonly string[]).includes(value)
  );
}

export function parseStoresHomeDataSource(
  raw: unknown,
  fallback: StoresHomeDataSourceId
): StoresHomeDataSourceId {
  return isStoresHomeDataSourceId(raw) ? raw : fallback;
}

export function defaultDataSourceForSlot(
  slot: string | null
): StoresHomeDataSourceId {
  if (!slot || !(slot in STORES_HOME_SLOT_DEFAULT_DATA_SOURCE)) return "order_now";
  return STORES_HOME_SLOT_DEFAULT_DATA_SOURCE[slot as HomePurposeOrRestSlot];
}

export function isFoodHomeDataSource(source: StoresHomeDataSourceId): boolean {
  return source !== "rest_stores";
}

/**
 * HA-4 — 슬롯이 실제로 처리하는 데이터 소스만. 음식 선반은 「나머지 매장」을 배정하지 않으므로(composer 항상 0) 제외,
 * 더 많은 매장(rest) 선반은 모든 소스를 필터로 쓴다.
 */
export function dataSourcesAllowedForSlot(slot: string | null): readonly StoresHomeDataSourceId[] {
  return slot === "slot6RestStores"
    ? STORES_HOME_DATA_SOURCE_IDS
    : STORES_HOME_DATA_SOURCE_IDS.filter(isFoodHomeDataSource);
}

/** 저장값이 슬롯에서 처리되지 않는 소스면 슬롯 기본 소스로 (관리자·고객 같은 해석) */
export function coerceDataSourceForSlot(
  slot: string | null,
  source: StoresHomeDataSourceId
): StoresHomeDataSourceId {
  return dataSourcesAllowedForSlot(slot).includes(source) ? source : defaultDataSourceForSlot(slot);
}

export function presentationsAllowedForDataSource(
  source: StoresHomeDataSourceId
): readonly StoresHomePresentationPatternId[] {
  if (source === "rest_stores") {
    // HA-5 — 더 많은 매장 렌더러가 그리는 표현만 (평점 가로는 음식 선반 전용)
    return ["timesale_vertical", "store_horizontal", "store_teaser_horizontal"];
  }
  return [
    "food_horizontal",
    "editorial_grid",
    "high_rating_horizontal",
    "store_horizontal",
    "store_teaser_horizontal",
    "brand_circular",
  ];
}

export function coercePresentationForDataSource(
  source: StoresHomeDataSourceId,
  presentation: StoresHomePresentationPatternId
): StoresHomePresentationPatternId {
  const allowed = presentationsAllowedForDataSource(source);
  if (allowed.includes(presentation)) return presentation;
  return source === "rest_stores" ? "timesale_vertical" : "food_horizontal";
}

export function storeMatchesHomeDataSource(
  store: StoreHomeFeedItem,
  source: StoresHomeDataSourceId,
  nowMs: number = Date.now()
): boolean {
  switch (source) {
    case "order_now":
      // 샘플도 실매장과 같은 기준 (영업 중 + 배달 가능). 주문 차단은 매장 상세·주문 API 에서만 (Owner 2026-10-29)
      return store.status === "open" && store.deliveryAvailable;
    case "popular_menu":
      return (store.completedOrderCount30d ?? 0) > 0;
    case "new_store":
      return isNewStoreSignal({ firstListedAt: store.firstListedAt, nowMs });
    case "editorial_promo":
      return String(store.discoveryCampaign?.id ?? "").trim().length > 0;
    case "delivery_fee_benefit": {
      const strike = store.deliveryFeeStrikePhp;
      return strike != null && Number.isFinite(Number(strike)) && Number(strike) > 0;
    }
    case "high_rating":
      return store.rating >= STORES_HOME_TOP_RATED_MIN_RATING && store.reviewCount >= STORES_HOME_TOP_RATED_MIN_REVIEWS;
    case "recommended":
      return store.isFeatured === true;
    case "rest_stores":
      return true;
  }
}

export type HomeShelfHiddenReason =
  | "unavailable"
  | "disabled"
  | "schedule"
  | "empty_candidate"
  | "no_product"
  | "max_zero"
  | null;

/** 선반이 고객 홈에 안 나오는 실제 이유 — 배정 진단(`allocateHomeFoodShelf`)에서만 계산 */
export function diagnoseHomeShelfCustomerHidden(input: {
  unavailable: boolean;
  enabled: boolean;
  scheduleOk: boolean;
  candidateCount: number;
  noProductCount: number;
  max: number | null;
  allocatedCount: number;
}): { customerVisible: boolean; hiddenReason: HomeShelfHiddenReason } {
  if (input.unavailable) return { customerVisible: false, hiddenReason: "unavailable" };
  if (!input.enabled) return { customerVisible: false, hiddenReason: "disabled" };
  if (!input.scheduleOk) return { customerVisible: false, hiddenReason: "schedule" };
  if (input.candidateCount <= 0) return { customerVisible: false, hiddenReason: "empty_candidate" };
  if (input.allocatedCount > 0) return { customerVisible: true, hiddenReason: null };
  if (input.max != null && input.max <= 0) return { customerVisible: false, hiddenReason: "max_zero" };
  return { customerVisible: false, hiddenReason: "no_product" };
}

export type HomeShelfSourcePresentationError =
  | { code: "invalid_data_source"; dataSource: string }
  | { code: "data_source_not_allowed_for_slot"; dataSource: StoresHomeDataSourceId }
  | {
      code: "presentation_not_allowed_for_data_source";
      dataSource: StoresHomeDataSourceId;
      presentation: string;
    };

/**
 * 저장 검증 — 슬롯이 처리하지 않는 소스·소스가 그리지 않는 표현은 저장 거부(400).
 * 읽기 단계 coerce* 는 이 검증 이전에 저장된 행만 보정한다 (새 저장값은 그대로 앱에 반영).
 */
export function validateHomeShelfSourceAndPresentation(input: {
  slot: string | null;
  dataSource: unknown;
  presentation: unknown;
}): HomeShelfSourcePresentationError | null {
  let source = defaultDataSourceForSlot(input.slot);
  if (input.dataSource !== undefined && input.dataSource !== null) {
    if (!isStoresHomeDataSourceId(input.dataSource)) {
      return { code: "invalid_data_source", dataSource: String(input.dataSource) };
    }
    if (!dataSourcesAllowedForSlot(input.slot).includes(input.dataSource)) {
      return { code: "data_source_not_allowed_for_slot", dataSource: input.dataSource };
    }
    source = input.dataSource;
  }
  if (input.presentation !== undefined && input.presentation !== null) {
    const presentation = String(input.presentation);
    if (!(presentationsAllowedForDataSource(source) as readonly string[]).includes(presentation)) {
      return { code: "presentation_not_allowed_for_data_source", dataSource: source, presentation };
    }
  }
  return null;
}
