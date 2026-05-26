import type { AppLanguageCode } from "@/lib/i18n/config";
import { safeTranslate } from "@/lib/i18n/safe-translate";
import {
  resolveStoreFoodSubtopicLabel,
  resolveStorePrimaryIndustryLabel,
  resolveStoreTopicLabel,
} from "@/lib/i18n/store-browse-label-i18n";
import {
  STORES_HOME_PRIMARY_CATEGORY_ICONS,
  STORES_HOME_RESTAURANT_SUB_ICONS,
} from "@/lib/stores/stores-home-category-fallback-icons";
import { getStoresHomeTaxonomySeedState } from "@/lib/stores/stores-home-taxonomy-seed";
import { storeSecondaryBrowseIconPath } from "@/lib/stores/store-secondary-browse-icons";
import { resolveStoreTaxonomyImageSrc, storeTaxonomyUploadedImageUrl } from "@/lib/stores/store-taxonomy-image-src";
import type { StoreTaxonomyCategory, StoreTaxonomyTopic } from "@/lib/stores/store-taxonomy-types";
import { storesBrowsePath } from "@/components/stores/browse/stores-browse-paths";

const RESTAURANT_SLUG = "restaurant";

export const STORES_HOME_CATEGORY_SSR_SEED_ID = "stores-home-category-ssr-seed";

function sortPrimariesRestaurantFirst<T extends { slug: string; sort_order?: number }>(rows: T[]): T[] {
  const sorted = [...rows].sort((a, b) => (a.sort_order ?? 0) - (b.sort_order ?? 0));
  const ri = sorted.findIndex((p) => p.slug === RESTAURANT_SLUG);
  if (ri > 0) {
    const [r] = sorted.splice(ri, 1);
    sorted.unshift(r);
  }
  return sorted;
}

export type StoresHomeSubCategorySeedItem = {
  id: string;
  href: string;
  label: string;
  src: string;
  isUploaded: boolean;
};

export type StoresHomePrimaryCategorySeedItem = {
  id: string;
  slug: string;
  label: string;
  src: string;
  isUploaded: boolean;
  selected: boolean;
};

export type StoresHomeCategorySeedPanelModel = {
  primarySlug: string;
  subs: StoresHomeSubCategorySeedItem[];
  primaries: StoresHomePrimaryCategorySeedItem[];
  primaryAriaLabel: string;
};

function resolveSubCategoryFallbackIcon(primarySlug: string, subSlug: string, indexInGrid: number): string | null {
  if (primarySlug === RESTAURANT_SLUG) {
    return STORES_HOME_RESTAURANT_SUB_ICONS[subSlug.trim().toLowerCase()] ?? null;
  }
  return storeSecondaryBrowseIconPath(primarySlug, indexInGrid);
}

export function buildStoresHomeSubCategorySeedItems(
  language: AppLanguageCode,
  primarySlug: string,
  topics: StoreTaxonomyTopic[]
): StoresHomeSubCategorySeedItem[] {
  const items: StoresHomeSubCategorySeedItem[] = [];
  topics.forEach((s, idx) => {
    const subSlug = String(s.slug ?? "").trim().toLowerCase();
    const uploaded = storeTaxonomyUploadedImageUrl(s.image_url);
    const fallback = resolveSubCategoryFallbackIcon(primarySlug, subSlug, idx);
    const src = resolveStoreTaxonomyImageSrc(uploaded, fallback);
    if (!src) return;
    const label =
      primarySlug === RESTAURANT_SLUG ?
        resolveStoreFoodSubtopicLabel(language, subSlug, String(s.name ?? "").trim())
      : resolveStoreTopicLabel(language, s.slug, String(s.name ?? "").trim(), s.name_en);
    items.push({
      id: s.id,
      href: storesBrowsePath(primarySlug, s.slug),
      label,
      src,
      isUploaded: !!uploaded,
    });
  });
  return items;
}

function buildPrimaryItems(
  language: AppLanguageCode,
  primaries: StoreTaxonomyCategory[],
  activeSlug: string
): StoresHomePrimaryCategorySeedItem[] {
  return primaries.map((p) => {
    const uploaded = storeTaxonomyUploadedImageUrl(p.image_url);
    const icon = resolveStoreTaxonomyImageSrc(uploaded, STORES_HOME_PRIMARY_CATEGORY_ICONS[p.slug] ?? null) ?? "";
    return {
      id: p.id,
      slug: p.slug,
      label: resolveStorePrimaryIndustryLabel(language, p.slug, String(p.name ?? "").trim(), p.name_en),
      src: icon,
      isUploaded: !!uploaded,
      selected: p.slug === activeSlug,
    };
  });
}

/** SSR seed 패널 — API·chrome snapshot 과 동일 slug/순서 */
export function buildStoresHomeCategorySeedPanelModel(
  language: AppLanguageCode
): StoresHomeCategorySeedPanelModel {
  const taxonomy = getStoresHomeTaxonomySeedState();
  const primaries = sortPrimariesRestaurantFirst(taxonomy.categories);
  const restaurant = primaries.find((p) => p.slug === RESTAURANT_SLUG) ?? primaries[0];
  const catId = String(restaurant?.id ?? "").trim();
  const activeSlug = restaurant?.slug ?? RESTAURANT_SLUG;
  const subs = taxonomy.topics
    .filter((topic) => topic.store_category_id === catId)
    .sort((a, b) => (a.sort_order ?? 0) - (b.sort_order ?? 0));

  return {
    primarySlug: activeSlug,
    subs: buildStoresHomeSubCategorySeedItems(language, activeSlug, subs),
    primaries: buildPrimaryItems(language, primaries, activeSlug),
    primaryAriaLabel: safeTranslate(language, "store_primary_industry_aria", {
      fallbackKo: "대분류 업종",
      fallbackEn: "Main category",
    }),
  };
}
