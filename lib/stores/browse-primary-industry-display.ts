import type { BrowsePrimaryIndustry } from "@/lib/stores/browse-mock/types";
import { STORES_HOME_PRIMARY_CATEGORY_ICONS } from "@/lib/stores/stores-home-category-fallback-icons";
import {
  resolveStoreTaxonomyImageSrc,
  storeTaxonomyUploadedImageUrl,
} from "@/lib/stores/store-taxonomy-image-src";

/** browse 헤더·▼ 패널 — 1차 업종 고정 순서 (`/stores` 홈과 동일) */
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

export type BrowsePrimaryIndustrySlug = (typeof BROWSE_PRIMARY_INDUSTRY_SLUG_ORDER)[number];

export type BrowsePrimaryIndustryWithImage = BrowsePrimaryIndustry & {
  imageUrl?: string | null;
  name_en?: string | null;
};

export function isBrowsePrimaryIndustrySlug(slug: string): slug is BrowsePrimaryIndustrySlug {
  return (BROWSE_PRIMARY_INDUSTRY_SLUG_ORDER as readonly string[]).includes(slug.toLowerCase());
}

/** mock·taxonomy 병합 목록을 8개 고정 순서로 정렬·필터 */
export function orderBrowsePrimaryIndustries(
  items: BrowsePrimaryIndustryWithImage[],
): BrowsePrimaryIndustryWithImage[] {
  const bySlug = new Map(items.map((p) => [p.slug.toLowerCase(), p]));
  return BROWSE_PRIMARY_INDUSTRY_SLUG_ORDER.map((slug) => bySlug.get(slug)).filter(
    (p): p is BrowsePrimaryIndustryWithImage => !!p,
  );
}

/** `/stores` 홈·`StoreCategoryExploreSection` 과 동일 — taxonomy 업로드 → 정적 PNG */
export function resolveBrowsePrimaryIndustryIcon(p: {
  slug: string;
  imageUrl?: string | null;
}): { src: string; isUploaded: boolean } | null {
  const slug = p.slug.toLowerCase();
  const uploaded = storeTaxonomyUploadedImageUrl(p.imageUrl);
  const src =
    resolveStoreTaxonomyImageSrc(uploaded, STORES_HOME_PRIMARY_CATEGORY_ICONS[slug] ?? null) ?? "";
  if (!src) return null;
  return { src, isUploaded: !!uploaded };
}
