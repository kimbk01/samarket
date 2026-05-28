"use client";

import Link from "next/link";
import { useCallback, useLayoutEffect, useMemo, useRef, useState, startTransition } from "react";
import { useI18n } from "@/components/i18n/AppLanguageProvider";
import {
  fetchStoresHomeFeedDeduped,
  forgetStoresHomeFeedFetchSingleFlight,
  type StoreApiJsonResponse,
} from "@/lib/stores/store-delivery-api-client";
import { getSingleFlightPromise } from "@/lib/http/run-single-flight";
import { storesHomeFeedSingleFlightKey } from "@/lib/stores/stores-home-network-guards";
import {
  applyStoresHomeFeedNetworkResult,
  readStoresHomeFeedInitialSnapshot,
  resolveStoresHomeFeedCacheForLoad,
} from "@/lib/stores/stores-home-feed-load-policy";
import { invalidateStoreHomeFeedClientCache } from "@/lib/stores/store-home-feed-client-cache";
import { writeStoresHomeFeedLiveStore } from "@/lib/stores/stores-home-feed-live-store";
import { useRefetchOnPageShowRestore } from "@/lib/ui/use-refetch-on-page-show";
import type { StoreHomeFeedItem } from "@/lib/stores/store-home-feed-types";
import {
  flattenStoresHomeFoodEntries,
  pickStoresHomeOpenNow,
} from "@/lib/stores/stores-home-feed-sections";
import { pickStoresHomePrimaryRowList } from "@/lib/stores/stores-home-feed-display-contract";
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
import { StoresHomePrimaryStoreRowListSection } from "@/components/stores/home/hub/StoresHomePrimaryStoreRowListSection";
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
} from "@/lib/stores/stores-home-lcp-policy";

/** CONTRACT: `StoresHomeQuickCategories` 는 피드 로딩과 분리·항상 마운트 — `verify:stores-home-hub-contract`. */
export function StoresHomeHub({
  querySuffix,
  buyerState: _buyerState,
  recentOrder: _recentOrder,
}: {
  querySuffix: string;
  buyerState: StoreOrderDashboardBuyerState;
  recentOrder: RecentOrderPreview | null;
}) {
  const { t, language } = useI18n();

  /** SSR·hydration 동일 초기값 — `window`/`liveStore` 는 layout effect 에서만 주입 */
  const [stores, setStores] = useState<StoreHomeFeedItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [meta, setMeta] = useState<{ source?: string } | null>(null);
  const requestIdRef = useRef(0);
  const abortRef = useRef<AbortController | null>(null);
  const metaRef = useRef(meta);
  const storesRef = useRef(stores);
  const scrollReadyMarkedRef = useRef(false);
  const feedSnapshotSeededRef = useRef(false);

  useLayoutEffect(() => {
    metaRef.current = meta;
  }, [meta]);

  useLayoutEffect(() => {
    storesRef.current = stores;
  }, [stores]);

  useLayoutEffect(() => {
    feedSnapshotSeededRef.current = false;
  }, [querySuffix]);

  useLayoutEffect(() => {
    if (feedSnapshotSeededRef.current) return;
    feedSnapshotSeededRef.current = true;
    const snap = readStoresHomeFeedInitialSnapshot(querySuffix);
    if (snap.stores.length === 0) return;
    setStores(snap.stores);
    setMeta(snap.meta);
    setLoading(false);
    storesRef.current = snap.stores;
    metaRef.current = snap.meta;
  }, [querySuffix]);

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
    async (opts?: { silent?: boolean; force?: boolean; fromBfcacheRestore?: boolean }) => {
      const silent = !!opts?.silent;
      const force = opts?.force === true;
      const requestId = ++requestIdRef.current;
      abortRef.current?.abort();
      const controller = new AbortController();
      abortRef.current = controller;
      if (force) {
        invalidateStoreHomeFeedClientCache(querySuffix);
        if (querySuffix) invalidateStoreHomeFeedClientCache("");
        forgetStoresHomeFeedFetchSingleFlight(querySuffix, language);
        if (querySuffix) forgetStoresHomeFeedFetchSingleFlight("", language);
      }
      const cachedSnapshot = resolveStoresHomeFeedCacheForLoad(querySuffix);
      const cachedEntry = cachedSnapshot.entry;
      const hasFreshCache = cachedSnapshot.isFresh;
      if (!force && cachedEntry && cachedEntry.stores.length > 0) {
        writeStoresHomeFeedLiveStore(querySuffix, cachedEntry.stores, cachedEntry.meta);
        startTransition(() => {
          setStores(cachedEntry.stores);
          setMeta(cachedEntry.meta);
          setLoading(false);
        });
        if (hasFreshCache && !opts?.fromBfcacheRestore) return;
      }
      const hasDisplayableStores = storesRef.current.length > 0 || (cachedEntry?.stores.length ?? 0) > 0;
      if (!silent && !hasDisplayableStores) setLoading(true);
      try {
        const flightKey = storesHomeFeedSingleFlightKey(querySuffix, language);
        const inflight = !force ? getSingleFlightPromise<StoreApiJsonResponse>(flightKey) : undefined;
        const { status, json } = await (inflight ??
          fetchStoresHomeFeedDeduped(querySuffix, {
            signal: controller.signal,
            language,
            clientCallSource: "stores_home_mount",
          }));
        if (requestId !== requestIdRef.current || controller.signal.aborted) return;
        startTransition(() => {
          setStores((prevStores) => {
            const applied = applyStoresHomeFeedNetworkResult({
              querySuffix,
              status,
              json,
              previousStores: prevStores,
              previousMeta: metaRef.current,
            });
            setMeta(applied.meta);
            metaRef.current = applied.meta;
            if (applied.stores.length > 0) {
              writeStoresHomeFeedLiveStore(querySuffix, applied.stores, applied.meta);
            }
            return applied.stores;
          });
        });
      } catch (error) {
        if (error instanceof DOMException && error.name === "AbortError") return;
        if (requestId !== requestIdRef.current || controller.signal.aborted) return;
        const cached = resolveStoresHomeFeedCacheForLoad(querySuffix);
        if (cached.entryStores.length > 0) {
          writeStoresHomeFeedLiveStore(querySuffix, cached.entryStores, cached.entry?.meta ?? null);
          startTransition(() => {
            setStores(cached.entryStores);
            setMeta(cached.entry?.meta ?? null);
          });
        }
      } finally {
        if (abortRef.current === controller) abortRef.current = null;
        if (!silent && requestId === requestIdRef.current) {
          startTransition(() => setLoading(false));
        }
      }
    },
    [language, querySuffix]
  );

  useLayoutEffect(() => {
    void loadFeed();
    return () => abortRef.current?.abort();
  }, [loadFeed]);

  useRefetchOnPageShowRestore(() => void loadFeed({ silent: true, fromBfcacheRestore: true }), {
    enableVisibilityRefetch: false,
  });

  const openNowStores = useMemo(() => pickStoresHomeOpenNow(stores), [stores]);
  const primaryRowStores = useMemo(() => pickStoresHomePrimaryRowList(stores), [stores]);
  const fastFood = useMemo(() => flattenStoresHomeFoodEntries(openNowStores, 16), [openNowStores]);

  const hydrationStores = useMemo(() => stores.map((s) => ({ id: s.id, slug: s.slug })), [stores]);

  const eagerStoreIds = useMemo(() => {
    const ids = new Set<string>();
    for (const s of primaryRowStores) ids.add(s.id);
    for (const entry of fastFood) ids.add(entry.storeId);
    return [...ids];
  }, [fastFood, primaryRowStores]);

  const { hydratedByStoreId, getPhase, registerListItem } = useBrowseFeaturedItemsHydration(
    hydrationStores,
    {
      enabled: stores.length > 0,
      eagerStoreIds,
      viewportRootMargin: STORES_HOME_FEATURED_VIEWPORT_ROOT_MARGIN,
    }
  );

  /** SWR — 루트 탭에서는 첫 fetch 중에도 카드 스켈레톤으로 덮지 않음(탭 push 후 깜빡임 방지). */
  const showBlockingFeedSkeleton = loading && stores.length === 0;

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
        hydratedByStoreId={hydratedByStoreId}
        getPhase={getPhase}
        registerListItem={registerListItem}
      />
    ),
    [getPhase, hydratedByStoreId, loading, meta, registerListItem, stores]
  );

  return (
    <div className="stores-home-hub delivery-ui flex flex-col pb-4" data-stores-perf="shell">
      <StoresHomePerfBoot />
      <StoresHomeQuickCategories />
      <StoresHomePullRefreshRegister
        onRefresh={async () => {
          await loadFeed({ silent: false, force: true });
        }}
      />
      <StoresHomeCategorySeedPanelClient />
      <div className={`${STORES_HOME_STACK} px-[var(--delivery-page-x)] pt-1`}>
        <StoresHomeHeroBanner />

        {showBlockingFeedSkeleton ?
          <StoresHomeFeedPendingBlank />
        : <>
            {fastFood.length > 0 ?
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

            {primaryRowStores.length > 0 ?
              <StoresHomePrimaryStoreRowListSection
                stores={primaryRowStores}
                hydratedByStoreId={hydratedByStoreId}
                getPhase={getPhase}
                registerListItem={registerListItem}
              />
            : stores.length === 0 ?
              emptyFallback
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

function StoresHomeFeedPendingBlank() {
  return (
    <div
      className="min-h-[min(34vh,320px)]"
      aria-busy="true"
      data-stores-home-feed-pending-blank="true"
    />
  );
}
