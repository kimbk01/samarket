import type { StoreHomeFeedItem } from "@/lib/stores/store-home-feed-types";
import { sortStoreDiscoveryPopularRows } from "@/lib/stores/store-discovery-popular-store";
import { compareNewStoreShelfRows } from "@/lib/stores/store-new-store-signal";
import { compareStoreDiscoveryCampaignsForHome } from "@/lib/stores/store-discovery-campaign-authority";
import type { StoresHomeFoodEntry } from "@/lib/stores/stores-home-feed-sections";
import { buildPopularFoodEntry, buildRepresentativeFoodEntry } from "@/lib/stores/stores-home-food-entry";
import type { StoresHomeCompositionSlotKey } from "@/lib/stores/composition/stores-composition-home-slots";
import {
  defaultDataSourceForSlot,
  storeMatchesHomeDataSource,
  type StoresHomeDataSourceId,
} from "@/lib/stores/product/stores-home-data-source";

/**
 * Slot0 「지금 주문 가능」 가로 레일 cap — 기존 Hub `flattenStoresHomeFoodEntries(..., 16)` 계약.
 */
export const STORES_HOME_SLOT0_FOOD_MAX = 16;

/** Slot2 popular shelf cap */
export const STORES_HOME_POPULAR_SHELF_MAX = 20;

/** Slot4 rating shelf cap */
export const STORES_HOME_TOP_RATED_SHELF_MAX = 20;

/** Slot6 nearby cap — legacy split contract */
export const STORES_HOME_NEARBY_MAX = 24;

/** Slot5 featured grid cap */
export const STORES_HOME_SLOT5_FOOD_MAX = 8;

/** P1-C2 — presentation-only new-store shelf cap (not a Slot0–6 renumber) */
export const STORES_HOME_NEW_STORE_SHELF_MAX = 20;

/** P1-D B2 — presentation-only period campaign shelf cap (not a Slot0–6 renumber) */
export const STORES_HOME_CAMPAIGN_SHELF_MAX = 20;


export type StoresHomeFeedComposition = {
  slot0Food: StoresHomeFoodEntry[];
  /**
   * CUT 2 — always empty. Legacy main_stores / slot1Stores runtime authority removed.
   * Remainder discoverability owns `slot6RestStores` (rest_stores).
   */
  slot1Stores: StoreHomeFeedItem[];
  slot2Food: StoresHomeFoodEntry[];
  /** P1-C2 presentation shelf — between Slot2 and Slot3; not a slot renumber */
  newStoreFood: StoresHomeFoodEntry[];
  /** P1-D B2 presentation shelf — between newStore and Slot3; not a slot renumber */
  campaignFood: StoresHomeFoodEntry[];
  slot3Food: StoresHomeFoodEntry[];
  slot4Food: StoresHomeFoodEntry[];
  slot5Food: StoresHomeFoodEntry[];
  /** CUT 2 — DEFERRED fast_arrival; still computed but customer shelf unavailable */
  slot6NearbyStores: StoreHomeFeedItem[];
  slot6RestStores: StoreHomeFeedItem[];
};

function orderStoresByPopularMetric(stores: readonly StoreHomeFeedItem[]): StoreHomeFeedItem[] {
  if (stores.length <= 1) return [...stores];

  const popularRankById = new Map(
    stores.map((s) => [s.id, s.discoveryEligibilityRank ?? 99])
  );
  const sortRows = stores.map((s) => ({
    id: s.id,
    slug: s.slug,
    district: null,
    rating_avg: s.rating,
    review_count: s.reviewCount,
    completedOrderCount30d: s.completedOrderCount30d ?? 0,
  }));
  const sorted = sortStoreDiscoveryPopularRows(sortRows, popularRankById);
  const order = new Map(sorted.map((r, i) => [r.id, i]));
  return [...stores].sort((a, b) => (order.get(a.id) ?? 999) - (order.get(b.id) ?? 999));
}

function defaultMaxForSlot(slot: StoresHomeCompositionSlotKey): number {
  switch (slot) {
    case "slot0Food":
      return STORES_HOME_SLOT0_FOOD_MAX;
    case "slot2Food":
      return STORES_HOME_POPULAR_SHELF_MAX;
    case "newStoreFood":
      return STORES_HOME_NEW_STORE_SHELF_MAX;
    case "campaignFood":
      return STORES_HOME_CAMPAIGN_SHELF_MAX;
    case "slot3Food":
      return STORES_HOME_POPULAR_SHELF_MAX;
    case "slot4Food":
      return STORES_HOME_TOP_RATED_SHELF_MAX;
    case "slot5Food":
      return STORES_HOME_SLOT5_FOOD_MAX;
    default:
      return STORES_HOME_POPULAR_SHELF_MAX;
  }
}

function resolveSlotMax(
  slot: StoresHomeCompositionSlotKey,
  slotMax: Partial<Record<StoresHomeCompositionSlotKey, number | null>> | undefined
): number {
  const raw = slotMax?.[slot];
  if (raw == null) return defaultMaxForSlot(slot);
  return Math.max(0, raw);
}

function emptyComposition(): StoresHomeFeedComposition {
  return {
    slot0Food: [],
    slot1Stores: [],
    slot2Food: [],
    newStoreFood: [],
    campaignFood: [],
    slot3Food: [],
    slot4Food: [],
    slot5Food: [],
    slot6NearbyStores: [],
    slot6RestStores: [],
  };
}


/**
 * 홈 선반 구성 (Owner 2026-10-29 · 단일 경로).
 *
 * - 선반마다 독립: 고른 데이터 소스의 후보(`storeMatchesHomeDataSource` 하나)로 채운다. 다른 선반 노출과 무관.
 * - 중복 제외는 한 선반 안 상품만. 빈 선반은 채우지 않는다 (계약: 빈 선반 숨김).
 * - 범위 밖·주소 없는 회원 제외는 home-feed API 가 이미 끝낸 목록을 받는다 (`shouldExcludeStoreFromMemberDeliveryList`).
 * - 선반 설정이 없으면 기본 선반 순서·기본 소스로 같은 경로를 탄다 (레거시 고정 구성 없음).
 */

const FOOD_SLOTS: readonly StoresHomeCompositionSlotKey[] = [
  "slot0Food",
  "slot2Food",
  "newStoreFood",
  "campaignFood",
  "slot3Food",
  "slot4Food",
  "slot5Food",
];

/** 관리자 목록·미리보기용 — 고객 배정과 같은 계산의 이유 */
export type StoresHomeShelfAllocationDiagnostics = {
  /** 데이터 소스에 맞는 매장 수 */
  candidateCount: number;
  /** 후보지만 대표 메뉴(카드 상품)가 없어 뺀 매장 수 */
  noProductCount: number;
  /** 최대 개수 */
  max: number;
  /** 배정된 카드 수 */
  allocatedCount: number;
};

export type ComposeStoresHomeFeedOpts = {
  nowMs?: number;
  /** 켜진 음식 선반 순서. 없으면 기본 선반 전부 */
  purposeAllocationOrder?: StoresHomeCompositionSlotKey[];
  slotDataSources?: Partial<Record<StoresHomeCompositionSlotKey, StoresHomeDataSourceId>>;
  slotMax?: Partial<Record<StoresHomeCompositionSlotKey, number | null>>;
  slotPopularityWindowDays?: Partial<Record<StoresHomeCompositionSlotKey, 7 | 30 | 90>>;
  popularityCountsByDays?: Partial<Record<7 | 30 | 90, ReadonlyMap<string, number>>>;
};

function orderCandidatesForSource(
  candidates: StoreHomeFeedItem[],
  source: StoresHomeDataSourceId
): StoreHomeFeedItem[] {
  switch (source) {
    case "popular_menu":
      return orderStoresByPopularMetric(candidates);
    case "new_store":
      return [...candidates].sort((a, b) =>
        compareNewStoreShelfRows(
          { id: a.id, firstListedAt: String(a.firstListedAt ?? "") },
          { id: b.id, firstListedAt: String(b.firstListedAt ?? "") }
        )
      );
    case "editorial_promo":
      return [...candidates].sort((a, b) =>
        compareStoreDiscoveryCampaignsForHome(
          { id: String(a.discoveryCampaign!.id), startAt: String(a.discoveryCampaign!.startAt), endAt: String(a.discoveryCampaign!.endAt) },
          { id: String(b.discoveryCampaign!.id), startAt: String(b.discoveryCampaign!.startAt), endAt: String(b.discoveryCampaign!.endAt) }
        )
      );
    default:
      /** API 추천·노출 순서 유지 (Composition 은 순서를 바꾸지 않는다 — 계약 §5) */
      return candidates;
  }
}

function entryForSource(store: StoreHomeFeedItem, source: StoresHomeDataSourceId): StoresHomeFoodEntry | null {
  if (source === "popular_menu") return buildPopularFoodEntry(store);
  const base = buildRepresentativeFoodEntry(store);
  if (!base || source !== "editorial_promo") return base;
  const campaign = store.discoveryCampaign!;
  return {
    ...base,
    /** CUT 7 — 기획 프로모션 카드는 배달비 혜택 근거를 싣지 않는다 */
    discountEvidence: null,
    deliveryFeeStrikePhp: null,
    campaignTitle: campaign.title,
    campaignType: campaign.campaignType,
  };
}

/** 한 선반 배정 — 앱 composer·관리자 목록·미리보기가 모두 이 결과만 쓴다 */
export function allocateHomeFoodShelf(
  pool: readonly StoreHomeFeedItem[],
  source: StoresHomeDataSourceId,
  max: number,
  nowMs: number,
  popularityCounts?: ReadonlyMap<string, number>
): { entries: StoresHomeFoodEntry[]; diagnostics: StoresHomeShelfAllocationDiagnostics } {
  const counted =
    source === "popular_menu" && popularityCounts
      ? pool.map((s) => ({ ...s, completedOrderCount30d: popularityCounts.get(s.id) ?? 0 }))
      : pool;
  const candidates =
    source === "rest_stores" ? [] : counted.filter((s) => storeMatchesHomeDataSource(s, source, nowMs));
  const ordered = orderCandidatesForSource(candidates, source);
  const entries: StoresHomeFoodEntry[] = [];
  const seenProducts = new Set<string>();
  let noProductCount = 0;
  for (const store of ordered) {
    if (entries.length >= max) break;
    const entry = entryForSource(store, source);
    if (!entry) {
      noProductCount += 1;
      continue;
    }
    if (seenProducts.has(entry.productId)) continue;
    seenProducts.add(entry.productId);
    entries.push(entry);
  }
  return {
    entries,
    diagnostics: { candidateCount: candidates.length, noProductCount, max, allocatedCount: entries.length },
  };
}

export function composeStoresHomeFeedWithDiagnostics(
  stores: readonly StoreHomeFeedItem[],
  opts?: ComposeStoresHomeFeedOpts
): {
  composition: StoresHomeFeedComposition;
  diagnostics: Partial<Record<StoresHomeCompositionSlotKey, StoresHomeShelfAllocationDiagnostics>>;
} {
  const pool = [...stores];
  const nowMs = opts?.nowMs ?? Date.now();
  const composition = emptyComposition();
  const diagnostics: Partial<Record<StoresHomeCompositionSlotKey, StoresHomeShelfAllocationDiagnostics>> = {};

  for (const slot of opts?.purposeAllocationOrder ?? FOOD_SLOTS) {
    if (!FOOD_SLOTS.includes(slot)) continue;
    const source = opts?.slotDataSources?.[slot] ?? defaultDataSourceForSlot(slot);
    const days = opts?.slotPopularityWindowDays?.[slot] ?? 30;
    const { entries, diagnostics: diag } = allocateHomeFoodShelf(
      pool,
      source,
      resolveSlotMax(slot, opts?.slotMax),
      nowMs,
      source === "popular_menu" ? opts?.popularityCountsByDays?.[days] : undefined
    );
    (composition[slot] as StoresHomeFoodEntry[]) = entries;
    diagnostics[slot] = diag;
  }

  const restSource = opts?.slotDataSources?.slot6RestStores ?? defaultDataSourceForSlot("slot6RestStores");
  const restMax = opts?.slotMax?.slot6RestStores;
  const restCandidates = pool.filter((s) => storeMatchesHomeDataSource(s, restSource, nowMs));
  composition.slot6RestStores =
    restMax != null ? restCandidates.slice(0, Math.max(0, restMax)) : restCandidates;
  diagnostics.slot6RestStores = {
    candidateCount: restCandidates.length,
    noProductCount: 0,
    max: restMax ?? restCandidates.length,
    allocatedCount: composition.slot6RestStores.length,
  };

  return { composition, diagnostics };
}

/** HOME feed composer — feed 렌더당 1회. 입력 `stores` 는 API 추천·노출 순서를 유지해야 한다. */
export function composeStoresHomeFeed(
  stores: readonly StoreHomeFeedItem[],
  opts?: ComposeStoresHomeFeedOpts
): StoresHomeFeedComposition {
  return composeStoresHomeFeedWithDiagnostics(stores, opts).composition;
}

