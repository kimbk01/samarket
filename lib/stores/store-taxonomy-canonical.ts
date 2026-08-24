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

import type { AppLanguageCode } from "@/lib/i18n/config";
import { resolveLocalizedAdminLabel } from "@/lib/i18n/resolve-localized-admin-label";
import type { BrowsePrimaryIndustryWithImage } from "@/lib/stores/browse-primary-industry-display";
import type { BrowseSubIndustry } from "@/lib/stores/browse-taxonomy-ui-types";
import { storeTaxonomyUploadedImageUrl } from "@/lib/stores/store-taxonomy-image-src";
import type { StoreTaxonomyCategory, StoreTaxonomyTopic } from "@/lib/stores/store-taxonomy-types";

export type StoreTaxonomySnapshot = {
  categories: StoreTaxonomyCategory[];
  topics: StoreTaxonomyTopic[];
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
  return {
    categories: j.categories as StoreTaxonomyCategory[],
    topics: j.topics as StoreTaxonomyTopic[],
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
