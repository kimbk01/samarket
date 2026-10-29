/**
 * CONTRACT — `/stores` 홈 taxonomy 클라이언트 파싱.
 * DO NOT: browse mock·정적 seed 로 홈 첫 페인트 — admin API·TTL 캐시만.
 */
import { peekStoresTaxonomyClientCache } from "@/lib/stores/store-delivery-api-client";
import type { StoreTaxonomyCategory, StoreTaxonomyTopic } from "@/lib/stores/store-taxonomy-types";
import type { DeliveryMenuPublic } from "@/lib/stores/delivery-menus/delivery-menu-types";
import { readDeliveryMenusFromTaxonomyJson } from "@/lib/stores/delivery-menus/delivery-menu-overlay";
import {
  filterTaxonomyByBrowseHiddenScopeKeys,
  readBrowseHiddenScopeKeys,
  readBrowseScopeDisplayTitles,
} from "@/lib/stores/product/stores-browse-scope-visibility";

export type StoresHomeTaxonomyState = {
  categories: StoreTaxonomyCategory[];
  topics: StoreTaxonomyTopic[];
  /** 고객 「메뉴」 (배민 미러링 · 업종과 별개). 없으면 업종 화면 그대로 */
  menus?: DeliveryMenuPublic[];
};

export const STORES_HOME_TAXONOMY_EMPTY: StoresHomeTaxonomyState = {
  categories: [],
  topics: [],
};

export function parseStoresHomeTaxonomyJson(json: unknown): StoresHomeTaxonomyState | null {
  const j = json as { ok?: boolean; categories?: unknown; topics?: unknown };
  if (!j?.ok || !Array.isArray(j.categories) || !Array.isArray(j.topics)) return null;
  if (j.categories.length === 0) return null;
  /** P-01·P-02 — 고객 HOME 업종 그리드: 숨긴 scope 제외 + 어드민 표시명. */
  const filtered = filterTaxonomyByBrowseHiddenScopeKeys(
    {
      categories: j.categories as StoreTaxonomyCategory[],
      topics: j.topics as StoreTaxonomyTopic[],
    },
    readBrowseHiddenScopeKeys(json),
    readBrowseScopeDisplayTitles(json)
  );
  /** 고객 메뉴 (browse 스냅샷과 같은 규칙 — 업종 목록은 그대로) */
  const menus = readDeliveryMenusFromTaxonomyJson(json);
  if (menus.length === 0) return filtered;
  return { ...filtered, menus };
}

/** API 성공 시 authoritative. 실패·빈 응답은 fallback(기본 empty) — seed/fallback PNG 금지 */
export function resolveStoresHomeTaxonomyFromApi(
  json: unknown,
  fallback: StoresHomeTaxonomyState = STORES_HOME_TAXONOMY_EMPTY
): StoresHomeTaxonomyState {
  const parsed = parseStoresHomeTaxonomyJson(json);
  if (!parsed) return fallback;
  return parsed;
}

/** 마운트 직전 prewarm·TTL 캐시 — seed보다 최신 API 스냅샷 우선 */
export function readStoresHomeTaxonomyFromClientCache(language?: string): StoresHomeTaxonomyState | null {
  const hit = peekStoresTaxonomyClientCache(language);
  if (!hit || hit.status !== 200) return null;
  return parseStoresHomeTaxonomyJson(hit.json);
}
