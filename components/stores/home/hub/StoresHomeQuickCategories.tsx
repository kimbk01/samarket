"use client";

import Link from "next/link";
import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import { useI18n } from "@/components/i18n/AppLanguageProvider";
import { HorizontalDragScroll } from "@/components/community/HorizontalDragScroll";
import { fetchStoresTaxonomyDeduped, prewarmStoresBrowseListClient } from "@/lib/stores/store-delivery-api-client";
import type { StoreTaxonomyCategory, StoreTaxonomyTopic } from "@/lib/stores/store-taxonomy-types";
import { storesBrowsePath } from "@/components/stores/browse/stores-browse-paths";
import {
  resolveStoreFoodSubtopicLabel,
  resolveStorePrimaryIndustryLabel,
  resolveStoreTopicLabel,
} from "@/lib/i18n/store-browse-label-i18n";
import { resolveStoreTaxonomyImageSrc, storeTaxonomyUploadedImageUrl } from "@/lib/stores/store-taxonomy-image-src";
import { StoreTaxonomyThumb } from "@/components/stores/StoreTaxonomyThumb";
import { storeSecondaryBrowseIconPath } from "@/lib/stores/store-secondary-browse-icons";
import {
  parseStoresHomeTaxonomyJson,
  readStoresHomeTaxonomyFromClientCache,
  type StoresHomeTaxonomyState,
} from "@/lib/stores/stores-home-taxonomy-client";
import {
  STORES_HOME_CATEGORY_LABEL,
  STORES_HOME_PRIMARY_CATEGORY_SCROLL,
  STORES_HOME_PRIMARY_CATEGORY_SECTION,
  STORES_HOME_PRIMARY_CATEGORY_TAB_BUTTON,
  STORES_HOME_PRIMARY_CATEGORY_TAB_INDICATOR,
  STORES_HOME_SUB_CATEGORY_GRID,
  STORES_HOME_SUB_CATEGORY_IMAGE_FRAME,
  STORES_HOME_SUB_CATEGORY_LABEL,
  STORES_HOME_SUB_CATEGORY_LINK,
} from "@/lib/stores/stores-home-ui";
import { StoresHomeCategoriesSkeleton } from "@/components/stores/home/hub/StoresHomeCategoriesSkeleton";

const RESTAURANT_SLUG = "restaurant";

const RESTAURANT_SUB_ICON: Record<string, string> = {
  korean: "/icons/food/icon_0_1.png",
  chinese: "/icons/food/icon_1_0.png",
  japanese: "/icons/food/icon_1_1.png",
  western: "/icons/food/icon_0_3.png",
  pizza: "/icons/food/icon_1_2.png",
  snack: "/icons/food/icon_1_3.png",
  chicken: "/icons/food/icon_0_2.png",
  lunchbox: "/icons/food/icon_2_0.png",
  local: "/icons/food/icon_2_1.png",
  dessert: "/icons/food/icon_2_2.png",
  late_night: "/icons/food/icon_2_3.png",
};

const PRIMARY_CATEGORY_ICONS: Record<string, string> = {
  restaurant: "/icons/category/category_0_1.png",
  mart: "/icons/category/category_0_2.png",
  hardware: "/icons/category/category_0_3.png",
  pet: "/icons/category/category_0_4.png",
  cafe: "/icons/category/category_0_5.png",
  beauty: "/icons/category/category_0_6.png",
  academy: "/icons/category/category_0_7.png",
  life: "/icons/category/category_0_8.png",
};

function sortPrimariesRestaurantFirst<T extends { slug: string; sort_order?: number; sortOrder?: number }>(
  rows: T[]
): T[] {
  const sorted = [...rows].sort(
    (a, b) => (a.sort_order ?? a.sortOrder ?? 0) - (b.sort_order ?? b.sortOrder ?? 0)
  );
  const ri = sorted.findIndex((p) => p.slug === RESTAURANT_SLUG);
  if (ri > 0) {
    const [r] = sorted.splice(ri, 1);
    sorted.unshift(r);
  }
  return sorted;
}

function StoresHomeSubCategoryTile({
  href,
  label,
  src,
  isUploaded,
  onPrewarm,
}: {
  href: string;
  label: string;
  src: string;
  isUploaded: boolean;
  onPrewarm: () => void;
}) {
  return (
    <Link href={href} onPointerDown={onPrewarm} className={STORES_HOME_SUB_CATEGORY_LINK} aria-label={label}>
      <span className={STORES_HOME_SUB_CATEGORY_IMAGE_FRAME}>
        <StoreTaxonomyThumb
          src={src}
          alt=""
          isUploaded={isUploaded}
          imgSize="fill"
          frameClassName="h-full w-full"
        />
      </span>
      <span className={STORES_HOME_SUB_CATEGORY_LABEL}>{label}</span>
    </Link>
  );
}

function resolveSubCategoryFallbackIcon(primarySlug: string, subSlug: string, indexInGrid: number): string | null {
  if (primarySlug === RESTAURANT_SLUG) {
    return RESTAURANT_SUB_ICON[subSlug.trim().toLowerCase()] ?? null;
  }
  return storeSecondaryBrowseIconPath(primarySlug, indexInGrid);
}

/**
 * CONTRACT — 홈 카테고리.
 * DO NOT: `listBrowsePrimaryIndustries` / `FOOD_CATEGORIES` 초기 렌더 — taxonomy·`StoresHomeCategoriesSkeleton` 만.
 */
export function StoresHomeQuickCategories() {
  const { t, language } = useI18n();
  const [taxonomy, setTaxonomy] = useState<StoresHomeTaxonomyState | null>(null);
  const [taxonomyReady, setTaxonomyReady] = useState(false);
  const [pickedSlug, setPickedSlug] = useState<string | null>(null);
  const cacheAppliedRef = useRef(false);

  useLayoutEffect(() => {
    const cached = readStoresHomeTaxonomyFromClientCache();
    if (!cached) return;
    cacheAppliedRef.current = true;
    setTaxonomy(cached);
    setTaxonomyReady(true);
  }, []);

  useEffect(() => {
    let cancelled = false;
    void (async () => {
      try {
        const { json: jRaw } = await fetchStoresTaxonomyDeduped();
        if (cancelled) return;
        const parsed = parseStoresHomeTaxonomyJson(jRaw) ?? readStoresHomeTaxonomyFromClientCache();
        if (parsed) setTaxonomy(parsed);
        else if (!cacheAppliedRef.current) setTaxonomy(null);
      } catch {
        if (!cancelled && !cacheAppliedRef.current) setTaxonomy(null);
      } finally {
        if (!cancelled) setTaxonomyReady(true);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  const primaries = useMemo(() => {
    if (!taxonomy) return [];
    return sortPrimariesRestaurantFirst(taxonomy.categories);
  }, [taxonomy]);

  const activeSlug = useMemo(() => {
    if (pickedSlug && primaries.some((p) => p.slug === pickedSlug)) return pickedSlug;
    return primaries.find((p) => p.slug === RESTAURANT_SLUG)?.slug ?? primaries[0]?.slug ?? RESTAURANT_SLUG;
  }, [pickedSlug, primaries]);

  const activePrimary = primaries.find((p) => p.slug === activeSlug);

  const subs = useMemo(() => {
    if (!taxonomy || !activePrimary) return [];
    const catId = String((activePrimary as StoreTaxonomyCategory).id ?? "").trim();
    if (!catId) return [];
    return taxonomy.topics
      .filter((topic) => topic.store_category_id === catId)
      .sort((a, b) => (a.sort_order ?? 0) - (b.sort_order ?? 0));
  }, [taxonomy, activePrimary]);

  const prewarmBrowseForSlug = useCallback(
    (subSlug?: string | null) => {
      const q = new URLSearchParams();
      q.set("primary", activeSlug.trim().toLowerCase());
      q.set("sub", (subSlug ?? "all").trim().toLowerCase() || "all");
      prewarmStoresBrowseListClient(q.toString(), { language });
    },
    [activeSlug, language]
  );

  if (!taxonomyReady) {
    return <StoresHomeCategoriesSkeleton />;
  }
  if (!taxonomy) {
    return null;
  }

  return (
    <section aria-label={t("store_primary_industry_aria")} className="space-y-0">
      <div className={STORES_HOME_SUB_CATEGORY_GRID}>
        {subs.map((s, idx) => {
          const subSlug = String(s.slug ?? "").trim().toLowerCase();
          const uploaded = storeTaxonomyUploadedImageUrl((s as StoreTaxonomyTopic).image_url);
          const fallback = resolveSubCategoryFallbackIcon(activeSlug, subSlug, idx);
          const src = resolveStoreTaxonomyImageSrc(uploaded, fallback);
          if (!src) return null;
          const label =
            activeSlug === RESTAURANT_SLUG ?
              resolveStoreFoodSubtopicLabel(
                language,
                subSlug,
                String((s as { nameKo?: string; name?: string }).nameKo ?? (s as { name?: string }).name ?? "").trim()
              )
            : resolveStoreTopicLabel(
                language,
                s.slug,
                String((s as { nameKo?: string; name?: string }).nameKo ?? (s as { name?: string }).name ?? "").trim(),
                (s as { name_en?: string | null }).name_en
              );
          return (
            <StoresHomeSubCategoryTile
              key={s.id}
              href={storesBrowsePath(activeSlug, s.slug)}
              label={label}
              src={src}
              isUploaded={!!uploaded}
              onPrewarm={() => prewarmBrowseForSlug(s.slug)}
            />
          );
        })}
      </div>

      <div className={STORES_HOME_PRIMARY_CATEGORY_SECTION}>
        <HorizontalDragScroll
          className={STORES_HOME_PRIMARY_CATEGORY_SCROLL}
          aria-label={t("store_primary_industry_aria")}
        >
          {primaries.map((p) => {
            const on = pickedSlug !== null && p.slug === activeSlug;
            const uploaded = storeTaxonomyUploadedImageUrl((p as StoreTaxonomyCategory).image_url);
            const icon =
              resolveStoreTaxonomyImageSrc(uploaded, PRIMARY_CATEGORY_ICONS[p.slug] ?? null) ?? "";
            return (
              <button
                key={p.id}
                type="button"
                role="tab"
                aria-selected={on}
                onClick={() => setPickedSlug(p.slug)}
                className={`${STORES_HOME_PRIMARY_CATEGORY_TAB_BUTTON} shrink-0 ${
                  on ? "text-[color:var(--delivery-text-main)]" : "text-[color:var(--delivery-text-muted)]"
                }`}
              >
                {icon ?
                  <StoreTaxonomyThumb
                    src={icon}
                    isUploaded={!!uploaded}
                    dimmed={!on}
                    imgSize="fill"
                    frameClassName="h-[var(--delivery-home-category-icon)] w-[var(--delivery-home-category-icon)] shrink-0 overflow-hidden rounded-full"
                  />
                : null}
                <span className={STORES_HOME_CATEGORY_LABEL}>
                  {resolveStorePrimaryIndustryLabel(
                    language,
                    p.slug,
                    String((p as { nameKo?: string; name?: string }).nameKo ?? (p as { name?: string }).name ?? "").trim(),
                    (p as { name_en?: string | null }).name_en
                  )}
                </span>
                <span
                  className={STORES_HOME_PRIMARY_CATEGORY_TAB_INDICATOR}
                  style={{ backgroundColor: on ? "var(--delivery-primary)" : "transparent" }}
                  aria-hidden
                />
              </button>
            );
          })}
        </HorizontalDragScroll>
      </div>
    </section>
  );
}
