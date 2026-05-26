/**
 * CONTRACT — `/stores` 홈 taxonomy 클라이언트 파싱.
 * DO NOT: browse mock(`listBrowsePrimaryIndustries`)으로 홈 첫 페인트 — seed·TTL 캐시·API.
 */
import { getStoresHomeTaxonomySeedState } from "@/lib/stores/stores-home-taxonomy-seed";
import { peekStoresTaxonomyClientCache } from "@/lib/stores/store-delivery-api-client";
import type { StoreTaxonomyCategory, StoreTaxonomyTopic } from "@/lib/stores/store-taxonomy-types";

export type StoresHomeTaxonomyState = {
  categories: StoreTaxonomyCategory[];
  topics: StoreTaxonomyTopic[];
};

export function parseStoresHomeTaxonomyJson(json: unknown): StoresHomeTaxonomyState | null {
  const j = json as { ok?: boolean; categories?: unknown; topics?: unknown };
  if (!j?.ok || !Array.isArray(j.categories) || !Array.isArray(j.topics)) return null;
  if (j.categories.length === 0) return null;
  return {
    categories: j.categories as StoreTaxonomyCategory[],
    topics: j.topics as StoreTaxonomyTopic[],
  };
}

/**
 * API 성공 시 authoritative 데이터, 실패·빈 응답 시 seed(또는 전달 fallback) 유지.
 * slug·sort_order 기준으로 레이아웃 치수는 seed와 동일하게 유지한다.
 */
export function resolveStoresHomeTaxonomyFromApi(
  json: unknown,
  fallback: StoresHomeTaxonomyState = getStoresHomeTaxonomySeedState()
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
