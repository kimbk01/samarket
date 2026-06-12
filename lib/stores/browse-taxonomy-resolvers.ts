import {
  listBrowsePrimaryIndustries,
  listBrowseSubIndustries,
} from "@/lib/stores/browse-taxonomy-seed-queries";
import type { BrowseSubIndustry } from "@/lib/stores/browse-taxonomy-ui-types";
import {
  BROWSE_PRIMARY_INDUSTRY_SLUG_ORDER,
  orderBrowsePrimaryIndustries,
  type BrowsePrimaryIndustryWithImage,
} from "@/lib/stores/browse-primary-industry-display";
import { storeTaxonomyUploadedImageUrl } from "@/lib/stores/store-taxonomy-image-src";
import type { StoreTaxonomyCategory, StoreTaxonomyTopic } from "@/lib/stores/store-taxonomy-types";

export type BrowseTaxonomyLoaded = {
  categories: StoreTaxonomyCategory[];
  topics: StoreTaxonomyTopic[];
};

/** GET /api/stores/taxonomy — browse 헤더·목록 공통 파싱 */
export function parseBrowseTaxonomyPayload(json: unknown): BrowseTaxonomyLoaded | null {
  const j = json as { ok?: boolean; categories?: unknown; topics?: unknown };
  if (!j?.ok || !Array.isArray(j.categories) || !Array.isArray(j.topics)) return null;
  return {
    categories: j.categories as StoreTaxonomyCategory[],
    topics: j.topics as StoreTaxonomyTopic[],
  };
}

/** 1차 8개 — taxonomy 라벨·image_url + mock fallback */
export function mergeBrowsePrimaryIndustries(
  taxonomy: BrowseTaxonomyLoaded | null,
): BrowsePrimaryIndustryWithImage[] {
  const fallback = listBrowsePrimaryIndustries();
  const mockBySlug = new Map(fallback.map((p) => [p.slug.toLowerCase(), p]));
  const taxBySlug = new Map(
    (taxonomy?.categories ?? []).map((c) => [c.slug.toLowerCase(), c]),
  );

  const merged: BrowsePrimaryIndustryWithImage[] = [];
  for (const slug of BROWSE_PRIMARY_INDUSTRY_SLUG_ORDER) {
    const fb = mockBySlug.get(slug);
    if (!fb) continue;
    const tax = taxBySlug.get(slug);
    merged.push({
      id: tax?.id ?? fb.id,
      slug: fb.slug,
      nameKo: tax?.name?.trim() || fb.nameKo,
      nameEn: tax?.name_en ?? fb.nameEn,
      name_en: tax?.name_en ?? fb.nameEn,
      sortOrder: tax?.sort_order ?? fb.sortOrder,
      symbol: fb.symbol,
      imageUrl: tax?.image_url ?? null,
    });
  }

  return orderBrowsePrimaryIndustries(merged);
}

/** 2차 업종 — primarySlug 기준 (taxonomy 우선, mock fallback) */
export function listBrowseSubIndustriesForPrimary(
  taxonomy: BrowseTaxonomyLoaded | null,
  primarySlug: string,
): BrowseSubIndustry[] {
  const pk = primarySlug.trim().toLowerCase();
  if (!taxonomy?.categories.length) return listBrowseSubIndustries(pk);

  const c = taxonomy.categories.find((x) => String(x.slug ?? "").trim().toLowerCase() === pk);
  if (!c) return [];

  const sorted = taxonomy.topics
    .filter((topic) => topic.store_category_id === c.id)
    .sort((a, b) => (a.sort_order ?? 0) - (b.sort_order ?? 0));

  const seenSlug = new Set<string>();
  const out: BrowseSubIndustry[] = [];
  for (const topic of sorted) {
    const sk = String(topic.slug ?? "").trim().toLowerCase();
    if (!sk || seenSlug.has(sk)) continue;
    seenSlug.add(sk);
    out.push({
      id: topic.id,
      slug: topic.slug,
      nameKo: topic.name,
      primarySlug: pk,
      sortOrder: topic.sort_order,
      imageUrl: storeTaxonomyUploadedImageUrl(topic.image_url) || null,
      name_en: topic.name_en ?? null,
    });
  }
  return out;
}

/** 1차 ▼·탭 이동 — 목록은 항상 `?sub=all` (2차 「전체」 칩 없음) */
export function resolveBrowsePrimaryEntryHref(primarySlug: string): { path: string } {
  const pk = primarySlug.trim().toLowerCase();
  return {
    path: `/stores/browse/${encodeURIComponent(pk)}?sub=all`,
  };
}
