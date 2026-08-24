"use client";

import { useCallback, useLayoutEffect, useMemo, useRef, useState, useSyncExternalStore } from "react";
import {
  fetchStoresTaxonomyDeduped,
  clearStoresTaxonomyClientCache,
  isStoresTaxonomyClientCacheFresh,
} from "@/lib/stores/store-delivery-api-client";
import { scheduleStoresBrowseListPrewarm } from "@/lib/stores/stores-browse-prewarm-coordinator";
import { useRegionOptional } from "@/contexts/RegionContext";
import type { StoreTaxonomyCategory } from "@/lib/stores/store-taxonomy-types";
import {
  readStoresHomeTaxonomyFromClientCache,
  resolveStoresHomeTaxonomyFromApi,
  STORES_HOME_TAXONOMY_EMPTY,
  type StoresHomeTaxonomyState,
} from "@/lib/stores/stores-home-taxonomy-client";
import {
  getStoresHomeCategoryChromeSnapshot,
  patchStoresHomeCategoryChrome,
  reconcileHomeCategoryPrimaries,
  selectHomePrimary,
  setStoresHomeCategoryChromeHandlers,
  subscribeStoresHomeCategoryChrome,
} from "@/lib/stores/stores-home-category-chrome-store";
import {
  sortTaxonomyCategories,
  sortTaxonomyTopicsForCategory,
} from "@/lib/stores/store-taxonomy-canonical";
import { useMainHubPtrDomain } from "@/lib/layout/use-main-hub-ptr-domain";
import { addStoresHomePullRefreshHandler } from "@/lib/stores/stores-home-pull-refresh-store";
import { useI18n } from "@/components/i18n/AppLanguageProvider";

const RESTAURANT_SLUG = "restaurant";

function resolveSubsForPrimary(
  taxonomy: StoresHomeTaxonomyState | null,
  primary: StoreTaxonomyCategory | undefined
) {
  if (!taxonomy || !primary) return [];
  const catId = String(primary.id ?? "").trim();
  if (!catId) return [];
  return sortTaxonomyTopicsForCategory(taxonomy.topics, catId);
}

/**
 * CONTRACT — taxonomy load + chrome store taxonomy patch only.
 * pickedPrimary/activePrimary authority: `stores-home-category-chrome-store`.
 */
export function StoresHomeQuickCategories() {
  const { t, language } = useI18n();
  const primaryRegion = useRegionOptional()?.primaryRegion ?? null;
  const activePtrDomain = useMainHubPtrDomain();
  const isStoresHubRoot = activePtrDomain === "stores";
  const [taxonomy, setTaxonomy] = useState<StoresHomeTaxonomyState | null>(null);
  const [taxonomyReady, setTaxonomyReady] = useState(false);
  const cacheAppliedRef = useRef(false);

  const activeSlug = useSyncExternalStore(
    subscribeStoresHomeCategoryChrome,
    () => getStoresHomeCategoryChromeSnapshot().activeSlug,
    () => RESTAURANT_SLUG
  );

  useLayoutEffect(() => {
    if (!isStoresHubRoot) return;
    return addStoresHomePullRefreshHandler(async () => {
      clearStoresTaxonomyClientCache(language);
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
    return sortTaxonomyCategories(taxonomy.categories);
  }, [taxonomy]);

  const topics = taxonomy?.topics ?? [];

  const activePrimary = primaries.find((p) => p.slug === activeSlug);

  const subs = useMemo(
    () => resolveSubsForPrimary(taxonomy, activePrimary),
    [taxonomy, activePrimary]
  );

  useLayoutEffect(() => {
    if (primaries.length === 0) return;
    reconcileHomeCategoryPrimaries(primaries);
  }, [primaries]);

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
      prewarmBrowsePrimary(slug);
      selectHomePrimary(slug);
    },
    [prewarmBrowsePrimary]
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
      topics,
      /** activeSlug 기준 파생 — selectHomePrimary 원자 pair 와 동일 규칙 */
      subs,
      language,
      primaryAriaLabel: t("store_primary_industry_aria"),
    });
  }, [language, primaries, topics, subs, t, taxonomyReady]);

  return null;
}
