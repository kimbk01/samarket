import type { BrowsePrimaryIndustry } from "@/lib/stores/browse-taxonomy-ui-types";
import {
  resolveStoreTaxonomyImageSrc,
  storeTaxonomyUploadedImageUrl,
} from "@/lib/stores/store-taxonomy-image-src";

/**
 * CUT 1 — fixed 8-slug order is no longer a runtime taxonomy authority.
 * Kept only as historical seed reference for Owner/apply fixtures that still
 * import seed catalog helpers — NOT for HOME/BROWSE industry chrome ordering.
 *
 * @deprecated CUT 1 — do not use for consumer order. Use store_categories.sort_order.
 */
export const BROWSE_PRIMARY_INDUSTRY_SLUG_ORDER = [
  "restaurant",
  "mart",
  "hardware",
  "pet",
  "cafe",
  "beauty",
  "academy",
  "life",
] as const;

/** @deprecated CUT 1 — slug whitelist is not taxonomy SSOT. */
export type BrowsePrimaryIndustrySlug = (typeof BROWSE_PRIMARY_INDUSTRY_SLUG_ORDER)[number];

export type BrowsePrimaryIndustryWithImage = BrowsePrimaryIndustry & {
  imageUrl?: string | null;
  name_en?: string | null;
};

/** @deprecated CUT 1 — not a runtime gate. Prefer taxonomy snapshot membership. */
export function isBrowsePrimaryIndustrySlug(slug: string): slug is BrowsePrimaryIndustrySlug {
  return (BROWSE_PRIMARY_INDUSTRY_SLUG_ORDER as readonly string[]).includes(slug.toLowerCase());
}

/**
 * @deprecated CUT 1 — fixed-order filter removed from authority.
 * Sorts by sortOrder ASC then slug (same as canonical) when still called.
 */
export function orderBrowsePrimaryIndustries(
  items: BrowsePrimaryIndustryWithImage[]
): BrowsePrimaryIndustryWithImage[] {
  return [...items].sort((a, b) => {
    const ao = a.sortOrder ?? 0;
    const bo = b.sortOrder ?? 0;
    if (ao !== bo) return ao - bo;
    return a.slug.toLowerCase().localeCompare(b.slug.toLowerCase());
  });
}

/** taxonomy image_url only — 정적 /public/icons 폴백 금지 */
export function resolveBrowsePrimaryIndustryIcon(p: {
  slug: string;
  imageUrl?: string | null;
}): { src: string; isUploaded: boolean } | null {
  const uploaded = storeTaxonomyUploadedImageUrl(p.imageUrl);
  const src = resolveStoreTaxonomyImageSrc(uploaded, null) ?? "";
  if (!src) return null;
  return { src, isUploaded: !!uploaded };
}
