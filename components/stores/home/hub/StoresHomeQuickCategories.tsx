"use client";

import { usePathname, useRouter } from "next/navigation";
import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState, useSyncExternalStore } from "react";
import { useI18n } from "@/components/i18n/AppLanguageProvider";
import { useSetMainTier1ExtrasOptional } from "@/contexts/MainTier1ExtrasContext";
import { STORES_HOME_PRIMARY_CATEGORY_STICKY_BELOW } from "@/components/stores/home/hub/StoresHomeCategoryStickyBelow";
import { fetchStoresTaxonomyDeduped, prewarmStoresBrowseListClient } from "@/lib/stores/store-delivery-api-client";
import type { StoreTaxonomyCategory } from "@/lib/stores/store-taxonomy-types";
import { storesBrowsePrimaryPath } from "@/components/stores/browse/stores-browse-paths";
import {
  parseStoresHomeTaxonomyJson,
  readStoresHomeTaxonomyFromClientCache,
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
      const q = new URLSearchParams();
      q.set("primary", activeSlug.trim().toLowerCase());
      q.set("sub", (subSlug ?? "all").trim().toLowerCase() || "all");
      prewarmStoresBrowseListClient(q.toString(), { language });
    },
    [activeSlug, language]
  );

  const prewarmBrowsePrimary = useCallback(
    (primarySlug: string) => {
      const q = new URLSearchParams();
      q.set("primary", primarySlug.trim().toLowerCase());
      q.set("sub", "all");
      prewarmStoresBrowseListClient(q.toString(), { language });
    },
    [language]
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
