/**
 * CONTRACT — `/stores` 홈 taxonomy 클라이언트 파싱.
 * DO NOT: browse mock(`listBrowsePrimaryIndustries`)으로 홈 첫 페인트 — 캐시·API만.
 */
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

/** 마운트 직전 prewarm·TTL 캐시 — mock/정적 아이콘 FOUC 방지 */
export function readStoresHomeTaxonomyFromClientCache(): StoresHomeTaxonomyState | null {
  const hit = peekStoresTaxonomyClientCache();
  if (!hit || hit.status !== 200) return null;
  return parseStoresHomeTaxonomyJson(hit.json);
}
