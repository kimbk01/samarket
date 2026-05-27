"use client";

import Link from "next/link";
import { useCallback, useLayoutEffect, useMemo, useRef, useState, startTransition } from "react";
import { useI18n } from "@/components/i18n/AppLanguageProvider";
import { fetchStoresHomeFeedDeduped } from "@/lib/stores/store-delivery-api-client";
import {
  readStoreHomeFeedClientCache,
  primeStoreHomeFeedClientCache,
} from "@/lib/stores/store-home-feed-client-cache";
import { useRefetchOnPageShowRestore } from "@/lib/ui/use-refetch-on-page-show";
import type { StoreHomeFeedItem } from "@/lib/stores/store-home-feed-types";
import {
  flattenStoresHomeFoodEntries,
  pickStoresHomeOpenNow,
} from "@/lib/stores/stores-home-feed-sections";
import { useBrowseFeaturedItemsHydration } from "@/lib/stores/use-browse-featured-items-hydration";
import { markStoresHomePerf } from "@/lib/stores/stores-home-perf-marks";
import { getMainAppScrollRootCached } from "@/lib/layout/main-app-scroll-root";
import { STORES_HOME_RAIL_SCROLL, STORES_HOME_STACK } from "@/lib/stores/stores-home-ui";
import { StoresHomeCategorySeedPanelClient } from "@/components/stores/home/hub/StoresHomeCategorySeedPanel.client";
import { StoresHomeQuickCategories } from "@/components/stores/home/hub/StoresHomeQuickCategories";
import { StoresHomePullRefreshRegister } from "@/components/stores/home/hub/StoresHomePullRefreshRegister";
import { StoresHomeHeroBanner } from "@/components/stores/home/hub/StoresHomeHeroBanner";
import { StoresHomeSectionShell } from "@/components/stores/home/hub/StoresHomeSectionShell";
import { StoresHomeFoodCard, resolveFoodCardImage } from "@/components/stores/home/hub/StoresHomeFoodCard";
import { StoresHomeSkeleton } from "@/components/stores/home/hub/StoresHomeSkeleton";
import { StoresHomeBuyerMyZone } from "@/components/stores/home/hub/StoresHomeBuyerMyZone";
import { StoresHomeDeferredViewport } from "@/components/stores/home/hub/StoresHomeDeferredViewport";
import { StoresHomeHubBelowFold } from "@/components/stores/home/hub/StoresHomeHubBelowFold";
import { StoresHomePerfBoot } from "@/components/stores/home/hub/StoresHomePerfBoot";
import type {
  RecentOrderPreview,
  StoreOrderDashboardBuyerState,
} from "@/components/stores/home/StoreOrderDashboardSection";
import { STORES_HOME_SECTION_BROWSE } from "@/lib/stores/stores-home-section-browse-hrefs";
import { FB } from "@/components/stores/store-facebook-feed-tokens";
import {
  STORES_HOME_BELOW_FOLD_ROOT_MARGIN,
  STORES_HOME_FEATURED_VIEWPORT_ROOT_MARGIN,
  STORES_HOME_FIRST_RAIL_FEATURED_EAGER,
} from "@/lib/stores/stores-home-lcp-policy";
import { useStoresHomeFeedRailLcpGate } from "@/lib/stores/use-stores-home-first-lcp";
import { useStoresHomeOverlayDeferUntilInput } from "@/lib/stores/use-stores-home-overlay-defer-until-input";

/** CONTRACT: `StoresHomeQuickCategories` 는 피드 로딩과 분리·항상 마운트 — `verify:stores-home-hub-contract`. */
export function StoresHomeHub({
  querySuffix,
  buyerState,
  recentOrder,
}: {
  querySuffix: string;
  buyerState: StoreOrderDashboardBuyerState;
  recentOrder: RecentOrderPreview | null;
}) {
  const { t } = useI18n();

  const [stores, setStores] = useState<StoreHomeFeedItem[]>(() => {
    if (typeof window === "undefined") return [];
    return readStoreHomeFeedClientCache("").entry?.stores ?? [];
  });
  const [loading, setLoading] = useState(() => {
    if (typeof window === "undefined") return true;
    return !readStoreHomeFeedClientCache("").entry;
  });
  const [meta, setMeta] = useState<{ source?: string } | null>(() => {
    if (typeof window === "undefined") return null;
    return readStoreHomeFeedClientCache("").entry?.meta ?? null;
  });
  const requestIdRef = useRef(0);
  const abortRef = useRef<AbortController | null>(null);
  const scrollReadyMarkedRef = useRef(false);
  const feedRailLcpReady = useStoresHomeFeedRailLcpGate();
  const deferStoresHomeCompetition = useStoresHomeOverlayDeferUntilInput();

  useLayoutEffect(() => {
    markStoresHomePerf("shell");
  }, []);

  useLayoutEffect(() => {
    if (scrollReadyMarkedRef.current) return;
    const root = getMainAppScrollRootCached();
    const check = () => {
      if (scrollReadyMarkedRef.current) return;
      if (root.scrollHeight > root.clientHeight + 8) {
        scrollReadyMarkedRef.current = true;
        markStoresHomePerf("scroll-ready");
      }
    };
    check();
    const id = window.requestAnimationFrame(check);
    return () => cancelAnimationFrame(id);
  }, [loading, stores.length]);

  const loadFeed = useCallback(
    async (opts?: { silent?: boolean }) => {
      const silent = !!opts?.silent;
      const requestId = ++requestIdRef.current;
      abortRef.current?.abort();
      const controller = new AbortController();
      abortRef.current = controller;
      const cachedSnapshot = readStoreHomeFeedClientCache(querySuffix);
      const cached = cachedSnapshot.entry;
      const fallbackSnapshot = !cached && querySuffix ? readStoreHomeFeedClientCache("") : null;
      const cachedEntry = cached ?? fallbackSnapshot?.entry ?? null;
      const hasFreshCache = cached ? cachedSnapshot.isFresh : (fallbackSnapshot?.isFresh ?? false);
      if (cachedEntry) {
        startTransition(() => {
          setStores(cachedEntry.stores);
          setMeta(cachedEntry.meta);
          setLoading(false);
        });
        if (!silent && hasFreshCache) return;
      }
      if (!silent && !cachedEntry) setLoading(true);
      try {
        const { json } = await fetchStoresHomeFeedDeduped(querySuffix, { signal: controller.signal });
        if (requestId !== requestIdRef.current || controller.signal.aborted) return;
        if (json && typeof json === "object" && (json as { ok?: boolean }).ok && Array.isArray((json as { stores?: unknown }).stores)) {
          const j = json as { stores: StoreHomeFeedItem[]; meta?: { source?: string } };
          primeStoreHomeFeedClientCache(querySuffix, { stores: j.stores, meta: j.meta ?? null });
          startTransition(() => {
            setStores(j.stores);
            setMeta(j.meta ?? null);
          });
        } else if (!silent) {
          startTransition(() => setStores([]));
        }
      } catch (error) {
        if (error instanceof DOMException && error.name === "AbortError") return;
        if (requestId !== requestIdRef.current || controller.signal.aborted) return;
        if (!silent) startTransition(() => setStores([]));
      } finally {
        if (abortRef.current === controller) abortRef.current = null;
        if (!silent && requestId === requestIdRef.current) {
          startTransition(() => setLoading(false));
        }
      }
    },
    [querySuffix]
  );

  useLayoutEffect(() => {
    void loadFeed();
    return () => abortRef.current?.abort();
  }, [loadFeed]);

  useRefetchOnPageShowRestore(() => void loadFeed({ silent: true }));

  const openNowStores = useMemo(() => pickStoresHomeOpenNow(stores), [stores]);
  const fastFood = useMemo(() => flattenStoresHomeFoodEntries(openNowStores, 16), [openNowStores]);

  const hydrationStores = useMemo(() => stores.map((s) => ({ id: s.id, slug: s.slug })), [stores]);

  const eagerStoreIds = useMemo(() => {
    const ids = new Set<string>();
    for (const entry of fastFood.slice(0, STORES_HOME_FIRST_RAIL_FEATURED_EAGER)) {
      if (entry.storeId) ids.add(entry.storeId);
    }
    return [...ids];
  }, [fastFood]);

  const { hydratedByStoreId, getPhase, registerListItem } = useBrowseFeaturedItemsHydration(
    hydrationStores,
    {
      enabled: stores.length > 0 && !deferStoresHomeCompetition,
      eagerStoreIds,
      viewportRootMargin: STORES_HOME_FEATURED_VIEWPORT_ROOT_MARGIN,
    }
  );

  const hasActiveOrder = buyerState.kind === "ready" && buyerState.activeOrders > 0;

  const emptyFallback = (
    <div className={`border border-dashed px-4 py-8 text-center ${FB.cardFlat} ${FB.hairline}`}>
      <p className={FB.body}>{t("store_no_registered_stores")}</p>
      <div className="mt-4 flex justify-center gap-2">
        <Link href={STORES_HOME_SECTION_BROWSE.orderNow()} prefetch={false} className={FB.secondaryBtn}>
          {t("store_more_food_link")}
        </Link>
      </div>
    </div>
  );

  const renderBelowFold = useCallback(
    () => (
      <StoresHomeHubBelowFold
        stores={stores}
        loading={loading}
        meta={meta}
        emptyFallback={emptyFallback}
        hydratedByStoreId={hydratedByStoreId}
        getPhase={getPhase}
        registerListItem={registerListItem}
      />
    ),
    [emptyFallback, getPhase, hydratedByStoreId, loading, meta, registerListItem, stores]
  );

  return (
    <div className="stores-home-hub delivery-ui flex flex-col pb-4" data-stores-perf="shell">
      <StoresHomePerfBoot />
      <StoresHomeQuickCategories />
      <StoresHomePullRefreshRegister
        onRefresh={async () => {
          await loadFeed({ silent: false });
        }}
      />
      <StoresHomeCategorySeedPanelClient />
      <div className={`${STORES_HOME_STACK} px-[var(--delivery-page-x)] pt-1`}>
        {hasActiveOrder ?
          <StoresHomeBuyerMyZone buyerState={buyerState} recentOrder={recentOrder} compact />
        : null}

        <StoresHomeHeroBanner />

        {loading ?
          <StoresHomeSkeleton />
        : <>
            {feedRailLcpReady && fastFood.length > 0 ?
              <StoresHomeSectionShell
                title={t("store_order_now_title")}
                actionHref={STORES_HOME_SECTION_BROWSE.orderNow()}
                actionLabel={t("store_browse_view_all")}
              >
                <div className={STORES_HOME_RAIL_SCROLL}>
                  {fastFood.map((entry, idx) => {
                    const img = resolveFoodCardImage(entry, hydratedByStoreId.get(entry.storeId));
                    return (
                      <StoresHomeFoodCard
                        key={`${entry.storeId}-${entry.productId}`}
                        entry={entry}
                        imageUrl={img.imageUrl}
                        loadingImage={img.loading}
                        markStoreCardPerf={idx === 0}
                      />
                    );
                  })}
                </div>
              </StoresHomeSectionShell>
            : null}

            <StoresHomeDeferredViewport
              rootMargin={STORES_HOME_BELOW_FOLD_ROOT_MARGIN}
              renderContent={renderBelowFold}
            />
          </>
        }
      </div>
    </div>
  );
}
