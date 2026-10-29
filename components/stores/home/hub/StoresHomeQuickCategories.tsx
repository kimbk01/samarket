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
import { useRouter } from "next/navigation";
import {
  resolveDeliveryHomeMenuEntries,
  type DeliveryHomeMenuEntry,
} from "@/lib/stores/delivery-menus/delivery-menu-overlay";

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
  const router = useRouter();
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
      try {
        const { status, json: jRaw } = await fetchStoresTaxonomyDeduped({
          language,
          clientCallSource: "stores_home_mount",
        });
        const httpOk =
          status >= 200 && status < 300 && (jRaw as { ok?: boolean } | null)?.ok !== false;
        if (!httpOk) return "error";
        const next = resolveStoresHomeTaxonomyFromApi(jRaw, STORES_HOME_TAXONOMY_EMPTY);
        /* 빈 카테고리 응답은 커밋하지 않음(기존 동작) — 표시 중 카테고리 유지 */
        if (next.categories.length === 0) return "success";
        setTaxonomy(next);
        setTaxonomyReady(true);
        cacheAppliedRef.current = true;
        return "success";
      } catch {
        /* 네트워크 실패 — 표시 중 카테고리 유지 (D11: unhandled rejection 제거) */
        return "error";
      }
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

  /** WP3 — 홈 아이콘 = 고객 메뉴(「홈 아이콘에 표시」 1단·2단). 메뉴 없음 = 1차 업종 그대로 */
  const primaries = useMemo<DeliveryHomeMenuEntry[]>(() => {
    if (!taxonomy) return [];
    return sortTaxonomyCategories(resolveDeliveryHomeMenuEntries(taxonomy.categories, taxonomy.menus));
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

  /**
   * WP3 (C1·C2) — 배민과 같이 홈 아이콘을 누르면 바로 해당 메뉴 페이지로 이동.
   * 홈 안에서 2차를 펼치는 동작·기본 선택 표시는 없다 (`pickedSlug` 는 null 유지).
   */
  const handleSelectPrimary = useCallback(
    (slug: string) => {
      const entry = primaries.find((p) => p.slug === slug);
      if (!entry) return;
      prewarmBrowsePrimary(entry.homePrimarySlug);
      router.push(entry.homeHref);
    },
    [prewarmBrowsePrimary, primaries, router]
  );

  /**
   * WP4 (D-1) — 누르는 순간 목록 미리 받기 + 이동할 경로 RSC 미리 받기.
   * 손을 떼고 이동할 때 경로 응답 대기(흰 화면)를 없앤다.
   */
  const prewarmHomeEntry = useCallback(
    (slug: string) => {
      const entry = primaries.find((p) => p.slug === slug);
      if (!entry) return;
      prewarmBrowsePrimary(entry.homePrimarySlug);
      router.prefetch(entry.homeHref);
    },
    [prewarmBrowsePrimary, primaries, router]
  );

  useLayoutEffect(() => {
    setStoresHomeCategoryChromeHandlers({
      onSelectPrimary: handleSelectPrimary,
      onPrewarmPrimary: prewarmHomeEntry,
      onPrewarmSub: prewarmBrowseForSlug,
    });
  }, [handleSelectPrimary, prewarmBrowseForSlug, prewarmHomeEntry]);

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
