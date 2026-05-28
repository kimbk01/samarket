"use client";

import { usePathname, useRouter } from "next/navigation";
import { useCallback, useLayoutEffect, useMemo, useRef, useState, useSyncExternalStore } from "react";
import { useI18n } from "@/components/i18n/AppLanguageProvider";
import { useSetMainTier1ExtrasOptional } from "@/contexts/MainTier1ExtrasContext";
import { STORES_HOME_PRIMARY_CATEGORY_STICKY_BELOW } from "@/components/stores/home/hub/StoresHomeCategoryStickyBelow";
import {
  fetchStoresTaxonomyDeduped,
  clearStoresTaxonomyClientCache,
  isStoresTaxonomyClientCacheFresh,
} from "@/lib/stores/store-delivery-api-client";
import { scheduleStoresBrowseListPrewarm } from "@/lib/stores/stores-browse-prewarm-coordinator";
import { useRegionOptional } from "@/contexts/RegionContext";
import type { StoreTaxonomyCategory } from "@/lib/stores/store-taxonomy-types";
import { storesBrowsePrimaryPath } from "@/components/stores/browse/stores-browse-paths";
import {
  readStoresHomeTaxonomyFromClientCache,
  resolveStoresHomeTaxonomyFromApi,
  STORES_HOME_TAXONOMY_EMPTY,
  type StoresHomeTaxonomyState,
} from "@/lib/stores/stores-home-taxonomy-client";
import {
  getStoresHomeCategoryChromeSnapshot,
  getStoresHomeCategoryChromeServerSnapshot,
  patchStoresHomeCategoryChrome,
  setStoresHomeCategoryChromeHandlers,
  subscribeStoresHomeCategoryChrome,
} from "@/lib/stores/stores-home-category-chrome-store";
import { useStoresHomePullRefresh } from "@/lib/stores/use-stores-home-pull-refresh";
import { useStoresHomeTouchRelease } from "@/lib/stores/use-stores-home-touch-release";
import { addStoresHomePullRefreshHandler } from "@/lib/stores/stores-home-pull-refresh-store";

const RESTAURANT_SLUG = "restaurant";

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

function isStoresHomePath(path: string): boolean {
  return path === "/stores" || path === "/stores/";
}

function resolveSubsForPrimary(
  taxonomy: StoresHomeTaxonomyState | null,
  primary: StoreTaxonomyCategory | undefined
) {
  if (!taxonomy || !primary) return [];
  const catId = String(primary.id ?? "").trim();
  if (!catId) return [];
  return taxonomy.topics
    .filter((topic) => topic.store_category_id === catId)
    .sort((a, b) => (a.sort_order ?? 0) - (b.sort_order ?? 0));
}

/**
 * CONTRACT — 홈 카테고리 상태·핸들러.
 * 레이아웃: 헤더 → 2차(`StoresHomeSubCategoryPanel`) → 1차(`StoresHomePrimaryCategoryPanel`).
 * 2차 숨김: 1차 → 헤더 stickyBelow 고정 + 탭은 browse 이동.
 */
export function StoresHomeQuickCategories() {
  const { t, language } = useI18n();
  const router = useRouter();
  const primaryRegion = useRegionOptional()?.primaryRegion ?? null;
  const pathname = usePathname() ?? "";
  const isStoresHubRoot = isStoresHomePath(pathname);
  const setMainTier1Extras = useSetMainTier1ExtrasOptional();
  const subCategoryInView = useSyncExternalStore(
    subscribeStoresHomeCategoryChrome,
    () => getStoresHomeCategoryChromeSnapshot().subCategoryInView,
    () => getStoresHomeCategoryChromeServerSnapshot().subCategoryInView
  );
  const [taxonomy, setTaxonomy] = useState<StoresHomeTaxonomyState | null>(null);
  const [taxonomyReady, setTaxonomyReady] = useState(false);
  const [pickedSlug, setPickedSlug] = useState<string | null>(null);
  const [activeSlug, setActiveSlug] = useState(RESTAURANT_SLUG);
  const cacheAppliedRef = useRef(false);

  useStoresHomePullRefresh(isStoresHubRoot);
  useStoresHomeTouchRelease(isStoresHubRoot);

  useLayoutEffect(() => {
    if (!isStoresHubRoot) return;
    return addStoresHomePullRefreshHandler(async () => {
      clearStoresTaxonomyClientCache();
      const { json: jRaw } = await fetchStoresTaxonomyDeduped({
        language,
        clientCallSource: "stores_home_mount",
      });
      const next = resolveStoresHomeTaxonomyFromApi(jRaw, STORES_HOME_TAXONOMY_EMPTY);
      if (next.categories.length === 0) return;
      setTaxonomy(next);
      setTaxonomyReady(true);
      cacheAppliedRef.current = true;
    });
  }, [isStoresHubRoot, language]);

  useLayoutEffect(() => {
    const cached = readStoresHomeTaxonomyFromClientCache(language);
    if (!cached || cached.categories.length === 0) return;
    cacheAppliedRef.current = true;
    setTaxonomy(cached);
    setTaxonomyReady(true);
  }, [language]);

  useLayoutEffect(() => {
    if (isStoresTaxonomyClientCacheFresh(language)) {
      const warmed = readStoresHomeTaxonomyFromClientCache(language);
      if (warmed && warmed.categories.length > 0) {
        cacheAppliedRef.current = true;
        setTaxonomy(warmed);
        setTaxonomyReady(true);
        return;
      }
    }
    let cancelled = false;
    void (async () => {
      try {
        const { json: jRaw } = await fetchStoresTaxonomyDeduped({
          language,
          clientCallSource: "stores_home_mount",
        });
        if (cancelled) return;
        const cached = readStoresHomeTaxonomyFromClientCache(language);
        const next = resolveStoresHomeTaxonomyFromApi(jRaw, cached ?? STORES_HOME_TAXONOMY_EMPTY);
        if (next.categories.length === 0) return;
        setTaxonomy(next);
        setTaxonomyReady(true);
        cacheAppliedRef.current = true;
      } catch {
        /* seed/fallback 금지 — 캐시 없으면 skeleton 유지 */
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [language]);

  const primaries = useMemo(() => {
    if (!taxonomy) return [];
    return sortPrimariesRestaurantFirst(taxonomy.categories);
  }, [taxonomy]);

  const activePrimary = primaries.find((p) => p.slug === activeSlug);

  const subs = useMemo(
    () => resolveSubsForPrimary(taxonomy, activePrimary),
    [taxonomy, activePrimary]
  );

  useLayoutEffect(() => {
    if (pickedSlug && !primaries.some((p) => p.slug === pickedSlug)) {
      setPickedSlug(null);
    }
    if (activeSlug && !primaries.some((p) => p.slug === activeSlug)) {
      const fallback =
        primaries.find((p) => p.slug === RESTAURANT_SLUG)?.slug ?? primaries[0]?.slug ?? RESTAURANT_SLUG;
      setActiveSlug(fallback);
    }
  }, [activeSlug, pickedSlug, primaries]);

  const prewarmBrowseForSlug = useCallback(
    (subSlug?: string | null) => {
      scheduleStoresBrowseListPrewarm({
        language,
        primary: activeSlug,
        sub: subSlug,
        primaryRegion,
      });
    },
    [activeSlug, language, primaryRegion]
  );

  const prewarmBrowsePrimary = useCallback(
    (primarySlug: string) => {
      scheduleStoresBrowseListPrewarm({
        language,
        primary: primarySlug,
        sub: "all",
        primaryRegion,
      });
    },
    [language, primaryRegion]
  );

  const handleSelectPrimary = useCallback(
    (slug: string) => {
      const next = slug.trim().toLowerCase();
      if (!next) return;
      prewarmBrowsePrimary(next);

      const subVisible = getStoresHomeCategoryChromeSnapshot().subCategoryInView;
      if (subVisible) {
        if (next === activeSlug && pickedSlug !== null) return;
        setPickedSlug(next);
        if (next !== activeSlug) setActiveSlug(next);
        return;
      }

      setPickedSlug(next);
      setActiveSlug(next);
      router.push(storesBrowsePrimaryPath(next));
    },
    [activeSlug, pickedSlug, prewarmBrowsePrimary, router]
  );

  useLayoutEffect(() => {
    setStoresHomeCategoryChromeHandlers({
      onSelectPrimary: handleSelectPrimary,
      onPrewarmPrimary: prewarmBrowsePrimary,
      onPrewarmSub: prewarmBrowseForSlug,
    });
  }, [handleSelectPrimary, prewarmBrowseForSlug, prewarmBrowsePrimary]);

  useLayoutEffect(() => {
    patchStoresHomeCategoryChrome({
      taxonomyReady,
      primaries,
      activeSlug,
      pickedSlug,
      subs,
      language,
      primaryAriaLabel: t("store_primary_industry_aria"),
    });
  }, [activeSlug, language, pickedSlug, primaries, subs, t, taxonomyReady]);

  useLayoutEffect(() => {
    if (!setMainTier1Extras || !isStoresHubRoot) return;
    if (taxonomyReady && !subCategoryInView) {
      setMainTier1Extras({ stickyBelow: STORES_HOME_PRIMARY_CATEGORY_STICKY_BELOW });
    } else {
      setMainTier1Extras(null);
    }
    return () => setMainTier1Extras(null);
  }, [isStoresHubRoot, setMainTier1Extras, subCategoryInView, taxonomyReady]);

  return null;
}
