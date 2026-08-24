/**
 * CUT 1 — browse taxonomy resolvers delegate to canonical SSOT.
 * Mock/seed merge and fixed 8-slug order removed from production consumers.
 */

import {
  parseStoreTaxonomySnapshot,
  resolveCanonicalPrimaryIndustries,
  resolveCanonicalSecondaryIndustries,
  type StoreTaxonomySnapshot,
} from "@/lib/stores/store-taxonomy-canonical";
import type { BrowseSubIndustry } from "@/lib/stores/browse-taxonomy-ui-types";
import type { BrowsePrimaryIndustryWithImage } from "@/lib/stores/browse-primary-industry-display";

/** @deprecated Use StoreTaxonomySnapshot — alias for existing imports. */
export type BrowseTaxonomyLoaded = StoreTaxonomySnapshot;

/** GET /api/stores/taxonomy — browse·HOME 공통 파싱 */
export function parseBrowseTaxonomyPayload(json: unknown): BrowseTaxonomyLoaded | null {
  return parseStoreTaxonomySnapshot(json);
}

/**
 * Primary industries from taxonomy only (sort_order ASC, slug ASC).
 * null/empty taxonomy → [] — no seed merge.
 */
export function mergeBrowsePrimaryIndustries(
  taxonomy: BrowseTaxonomyLoaded | null
): BrowsePrimaryIndustryWithImage[] {
  return resolveCanonicalPrimaryIndustries(taxonomy);
}

/**
 * Secondary industries for primary — taxonomy topics only.
 * null/empty / unknown primary → [] — no seed fallback.
 */
export function listBrowseSubIndustriesForPrimary(
  taxonomy: BrowseTaxonomyLoaded | null,
  primarySlug: string
): BrowseSubIndustry[] {
  return resolveCanonicalSecondaryIndustries(taxonomy, primarySlug);
}

/** 1차 ▼·탭 이동 — 목록은 항상 `?sub=all` (2차 「전체」 칩 없음) */
export function resolveBrowsePrimaryEntryHref(primarySlug: string): { path: string } {
  const pk = primarySlug.trim().toLowerCase();
  return {
    path: `/stores/browse/${encodeURIComponent(pk)}?sub=all`,
  };
}
