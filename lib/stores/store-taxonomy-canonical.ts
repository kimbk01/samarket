/**
 * CUT 1 — Canonical store taxonomy resolver (HOME + BROWSE shared).
 *
 * SSOT:
 *   PRIMARY   = store_categories (via GET /api/stores/taxonomy)
 *   SECONDARY = store_topics WHERE store_category_id = primary
 *
 * Order: sort_order ASC, then slug ASC (deterministic tie-break only).
 * No fixed-slug whitelist. No mock/seed merge for production consumers.
 */

import {
  filterTaxonomyByBrowseHiddenScopeKeys,
  readBrowseHiddenScopeKeys,
  readBrowseScopeDisplayTitles,
} from "@/lib/stores/product/stores-browse-scope-visibility";
import type { AppLanguageCode } from "@/lib/i18n/config";
import { resolveLocalizedAdminLabel } from "@/lib/i18n/resolve-localized-admin-label";
import type { BrowsePrimaryIndustryWithImage } from "@/lib/stores/browse-primary-industry-display";
import type { BrowseSubIndustry } from "@/lib/stores/browse-taxonomy-ui-types";
import { storeTaxonomyUploadedImageUrl } from "@/lib/stores/store-taxonomy-image-src";
import type { StoreTaxonomyCategory, StoreTaxonomyTopic } from "@/lib/stores/store-taxonomy-types";
import type { DeliveryMenuPublic } from "@/lib/stores/delivery-menus/delivery-menu-types";
import {
  applyDeliveryMenusToCategories,
  pruneDeliveryMenusToVisibleTaxonomy,
  readDeliveryMenusFromTaxonomyJson,
} from "@/lib/stores/delivery-menus/delivery-menu-overlay";

export type StoreTaxonomySnapshot = {
  categories: StoreTaxonomyCategory[];
  topics: StoreTaxonomyTopic[];
  /** WP1 — 고객 「메뉴」 (없으면 업종 그대로). 1차 목록에는 이미 입혀져 있다 */
  menus?: DeliveryMenuPublic[];
};

/** sort_order ASC → slug ASC. No product-priority overrides. */
export function compareStoreTaxonomySortOrder(
  a: { sort_order?: number | null; sortOrder?: number | null; slug: string },
  b: { sort_order?: number | null; sortOrder?: number | null; slug: string }
): number {
  const ao = Number(a.sort_order ?? a.sortOrder ?? 0);
  const bo = Number(b.sort_order ?? b.sortOrder ?? 0);
  if (ao !== bo) return ao - bo;
  return String(a.slug ?? "")
    .trim()
    .toLowerCase()
    .localeCompare(String(b.slug ?? "").trim().toLowerCase());
}

/** GET /api/stores/taxonomy payload → snapshot (null if invalid). */
export function parseStoreTaxonomySnapshot(json: unknown): StoreTaxonomySnapshot | null {
  const j = json as { ok?: boolean; categories?: unknown; topics?: unknown };
  if (!j?.ok || !Array.isArray(j.categories) || !Array.isArray(j.topics)) return null;
  /** P-01·P-02 — 고객 browse 탭·칩·헤더: 숨긴 scope 제외 + 어드민 표시명. */
  const filtered = filterTaxonomyByBrowseHiddenScopeKeys(
    {
      categories: j.categories as StoreTaxonomyCategory[],
      topics: j.topics as StoreTaxonomyTopic[],
    },
    readBrowseHiddenScopeKeys(json),
    readBrowseScopeDisplayTitles(json)
  );
  /** WP1 — 고객 메뉴: 1단 메뉴가 있는 1차만·메뉴 이름/아이콘/순서 (메뉴 없음 = 그대로) */
  const menus = pruneDeliveryMenusToVisibleTaxonomy(
    readDeliveryMenusFromTaxonomyJson(json),
    filtered.categories,
    filtered.topics
  );
  if (menus.length === 0) return filtered;
  return {
    ...filtered,
    categories: applyDeliveryMenusToCategories(filtered.categories, menus),
    menus,
  };
}

/**
 * Primary industries from taxonomy only.
 * Empty snapshot → [] (no seed fill).
 */
export function resolveCanonicalPrimaryIndustries(
  taxonomy: StoreTaxonomySnapshot | null | undefined
): BrowsePrimaryIndustryWithImage[] {
  if (!taxonomy?.categories.length) return [];

  const bySlug = new Map<string, BrowsePrimaryIndustryWithImage>();
  for (const c of taxonomy.categories) {
    const slug = String(c.slug ?? "").trim().toLowerCase();
    if (!slug) continue;
    const id = String(c.id ?? "").trim();
    if (!id) continue;
    bySlug.set(slug, {
      id,
      slug: String(c.slug).trim(),
      nameKo: String(c.name ?? "").trim() || slug,
      nameEn: c.name_en ?? null,
      name_en: c.name_en ?? null,
      sortOrder: Number(c.sort_order ?? 0),
      symbol: "",
      imageUrl: c.image_url ?? null,
    });
  }

  return [...bySlug.values()].sort(compareStoreTaxonomySortOrder);
}

/**
 * Secondary industries for one primary — taxonomy topics only.
 * Empty / unknown primary → [] (no seed fill).
 */
export function resolveCanonicalSecondaryIndustries(
  taxonomy: StoreTaxonomySnapshot | null | undefined,
  primarySlug: string
): BrowseSubIndustry[] {
  const pk = primarySlug.trim().toLowerCase();
  if (!pk || !taxonomy?.categories.length) return [];

  const primary = taxonomy.categories.find(
    (c) => String(c.slug ?? "").trim().toLowerCase() === pk
  );
  if (!primary) return [];

  const catId = String(primary.id ?? "").trim();
  if (!catId) return [];

  const sorted = taxonomy.topics
    .filter((topic) => String(topic.store_category_id ?? "").trim() === catId)
    .slice()
    .sort(compareStoreTaxonomySortOrder);

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
      nameEn: topic.name_en ?? null,
    });
  }
  return out;
}

export function resolveCanonicalPrimaryBySlug(
  taxonomy: StoreTaxonomySnapshot | null | undefined,
  primarySlug: string
): BrowsePrimaryIndustryWithImage | null {
  const pk = primarySlug.trim().toLowerCase();
  if (!pk) return null;
  return resolveCanonicalPrimaryIndustries(taxonomy).find((p) => p.slug.toLowerCase() === pk) ?? null;
}

/**
 * Display name from taxonomy fields only (no i18n slug catalog, no browse display_title_*).
 */
export function resolveTaxonomyIndustryLabel(
  lang: AppLanguageCode,
  nameKo: string,
  nameEn?: string | null,
  slugFallback?: string
): string {
  const admin = resolveLocalizedAdminLabel(lang, nameKo, nameEn);
  if (admin.trim()) return admin.trim();
  const ko = nameKo.trim();
  if (ko) return ko;
  return (slugFallback ?? "").trim();
}

/** Sort raw category rows the same way as canonical primaries (HOME chrome). */
export function sortTaxonomyCategories<T extends { slug: string; sort_order?: number }>(
  rows: readonly T[]
): T[] {
  return [...rows].sort(compareStoreTaxonomySortOrder);
}

/** Sort raw topic rows for a primary (HOME chrome). */
export function sortTaxonomyTopicsForCategory<T extends StoreTaxonomyTopic>(
  topics: readonly T[],
  categoryId: string
): T[] {
  const catId = String(categoryId ?? "").trim();
  if (!catId) return [];
  return topics
    .filter((t) => String(t.store_category_id ?? "").trim() === catId)
    .slice()
    .sort(compareStoreTaxonomySortOrder);
}
