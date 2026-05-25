"use client";

import Link from "next/link";
import { useCallback, useLayoutEffect, useMemo, useRef, useState } from "react";
import { useI18n } from "@/components/i18n/AppLanguageProvider";
import { fetchStoresHomeFeedDeduped } from "@/lib/stores/store-delivery-api-client";
import {
  readStoreHomeFeedClientCache,
  primeStoreHomeFeedClientCache,
} from "@/lib/stores/store-home-feed-client-cache";
import { useRefetchOnPageShowRestore } from "@/lib/ui/use-refetch-on-page-show";
import { isConstrainedNetwork } from "@/lib/ui/network-policy";
import type { StoreHomeFeedItem } from "@/lib/stores/store-home-feed-types";
import {
  flattenStoresHomeFoodEntries,
  splitStoresHomeFeed,
} from "@/lib/stores/stores-home-feed-sections";
import { useBrowseFeaturedItemsHydration } from "@/lib/stores/use-browse-featured-items-hydration";
import { STORES_HOME_RAIL_SCROLL, STORES_HOME_STACK } from "@/lib/stores/stores-home-ui";
import { StoresHomeQuickCategories } from "@/components/stores/home/hub/StoresHomeQuickCategories";
import { StoresHomeSubCategoryPanel } from "@/components/stores/home/hub/StoresHomeSubCategoryPanel";
import { StoresHomePrimaryCategoryPanel } from "@/components/stores/home/hub/StoresHomeCategoryStickyBelow";
import { StoresHomePullRefreshRegister } from "@/components/stores/home/hub/StoresHomePullRefreshRegister";
import { StoresHomeHeroBanner } from "@/components/stores/home/hub/StoresHomeHeroBanner";
import { StoresHomeSectionShell } from "@/components/stores/home/hub/StoresHomeSectionShell";
import { StoresHomeFoodCard, resolveFoodCardImage } from "@/components/stores/home/hub/StoresHomeFoodCard";
import { StoresHomeFeedList } from "@/components/stores/home/hub/StoresHomeFeedList";
import { StoresHomeSkeleton } from "@/components/stores/home/hub/StoresHomeSkeleton";
import { StoresHomeBuyerMyZone } from "@/components/stores/home/hub/StoresHomeBuyerMyZone";
import { StoresHomeStoreDiscoveryRail } from "@/components/stores/home/hub/StoresHomeStoreDiscoveryRail";
import type {
  RecentOrderPreview,
  StoreOrderDashboardBuyerState,
} from "@/components/stores/home/StoreOrderDashboardSection";
import { STORES_HOME_SECTION_BROWSE } from "@/lib/stores/stores-home-section-browse-hrefs";
import { FB } from "@/components/stores/store-facebook-feed-tokens";

const FEED_EXCLUDE_KEYS = ["premium", "open", "discount", "top"] as const;

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
        setStores(cachedEntry.stores);
        setMeta(cachedEntry.meta);
        setLoading(false);
        if (!silent && isConstrainedNetwork() && cached && hasFreshCache) return;
      }
      if (!silent && !cachedEntry) setLoading(true);
      try {
        const { json } = await fetchStoresHomeFeedDeduped(querySuffix, { signal: controller.signal });
        if (requestId !== requestIdRef.current || controller.signal.aborted) return;
        if (json && typeof json === "object" && (json as { ok?: boolean }).ok && Array.isArray((json as { stores?: unknown }).stores)) {
          const j = json as { stores: StoreHomeFeedItem[]; meta?: { source?: string } };
          primeStoreHomeFeedClientCache(querySuffix, { stores: j.stores, meta: j.meta ?? null });
          setStores(j.stores);
          setMeta(j.meta ?? null);
        } else if (!silent) {
          setStores([]);
        }
      } catch (error) {
        if (error instanceof DOMException && error.name === "AbortError") return;
        if (requestId !== requestIdRef.current || controller.signal.aborted) return;
        if (!silent) setStores([]);
      } finally {
        if (abortRef.current === controller) abortRef.current = null;
        if (!silent && requestId === requestIdRef.current) setLoading(false);
      }
    },
    [querySuffix]
  );

  useLayoutEffect(() => {
    void loadFeed();
    return () => abortRef.current?.abort();
  }, [loadFeed]);

  useRefetchOnPageShowRestore(() => void loadFeed({ silent: true }));

  const sections = useMemo(() => splitStoresHomeFeed(stores), [stores]);
  const fastFood = useMemo(() => flattenStoresHomeFoodEntries(sections.openNow, 16), [sections.openNow]);
  const recFood = useMemo(() => flattenStoresHomeFoodEntries(sections.premium, 8), [sections.premium]);

  const hydrationStores = useMemo(() => stores.map((s) => ({ id: s.id, slug: s.slug })), [stores]);
  /** fold 위 가로·그리드 레일만 eager — 전체 피드 batch storm 방지 */
  const eagerStoreIds = useMemo(() => {
    const ids = new Set<string>();
    for (const entry of fastFood.slice(0, 8)) {
      if (entry.storeId) ids.add(entry.storeId);
    }
    for (const entry of recFood.slice(0, 4)) {
      if (entry.storeId) ids.add(entry.storeId);
    }
    return [...ids];
  }, [fastFood, recFood]);
  const { hydratedByStoreId, getPhase, registerListItem } = useBrowseFeaturedItemsHydration(
    hydrationStores,
    { enabled: stores.length > 0, eagerStoreIds }
  );

  const hasActiveOrder = buyerState.kind === "ready" && buyerState.activeOrders > 0;

  const emptyFallback = (
    <div className={`border border-dashed px-4 py-8 text-center ${FB.cardFlat} ${FB.hairline}`}>
      <p className={FB.body}>{t("store_no_registered_stores")}</p>
      <div className="mt-4 flex justify-center gap-2">
        <Link href={STORES_HOME_SECTION_BROWSE.orderNow()} className={FB.secondaryBtn}>
          {t("store_more_food_link")}
        </Link>
      </div>
    </div>
  );

  return (
    <div className="stores-home-hub delivery-ui flex flex-col pb-4">
      <StoresHomeQuickCategories />
      <StoresHomePullRefreshRegister
        onRefresh={async () => {
          await loadFeed({ silent: false });
        }}
      />
      <StoresHomeSubCategoryPanel />
      <StoresHomePrimaryCategoryPanel />
      <div className={`${STORES_HOME_STACK} px-[var(--delivery-page-x)] pt-1`}>
      {loading ?
        <StoresHomeSkeleton />
      : <>
          {hasActiveOrder ?
            <StoresHomeBuyerMyZone buyerState={buyerState} recentOrder={recentOrder} compact />
          : null}

          <StoresHomeHeroBanner />

          {fastFood.length > 0 ?
            <StoresHomeSectionShell
              title={t("store_order_now_title")}
              actionHref={STORES_HOME_SECTION_BROWSE.orderNow()}
              actionLabel={t("store_browse_view_all")}
            >
              <div className={STORES_HOME_RAIL_SCROLL}>
                {fastFood.map((entry) => {
                  const img = resolveFoodCardImage(entry, hydratedByStoreId.get(entry.storeId));
                  return (
                    <StoresHomeFoodCard
                      key={`${entry.storeId}-${entry.productId}`}
                      entry={entry}
                      imageUrl={img.imageUrl}
                      loadingImage={img.loading}
                    />
                  );
                })}
              </div>
            </StoresHomeSectionShell>
          : null}

          <StoresHomeStoreDiscoveryRail
            title={t("store_badge_menu_discount")}
            stores={sections.discounted}
            adHint={t("store_badge_instant_discount")}
            actionHref={STORES_HOME_SECTION_BROWSE.discount()}
            actionLabel={t("store_browse_view_all")}
          />

          <StoresHomeStoreDiscoveryRail
            title={t("store_spot_recommended_subtitle")}
            stores={sections.topRated}
            actionHref={STORES_HOME_SECTION_BROWSE.topRated()}
            actionLabel={t("store_browse_view_all")}
          />

          {recFood.length > 0 ?
            <StoresHomeSectionShell title={t("store_spot_recommended_title")}>
              <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
                {recFood.slice(0, 4).map((entry) => {
                  const img = resolveFoodCardImage(entry, hydratedByStoreId.get(entry.storeId));
                  return (
                    <StoresHomeFoodCard
                      key={`rec-${entry.storeId}-${entry.productId}`}
                      entry={entry}
                      imageUrl={img.imageUrl}
                      loadingImage={img.loading}
                    />
                  );
                })}
              </div>
            </StoresHomeSectionShell>
          : null}

          {meta?.source === "supabase_unconfigured" ?
            <p className="rounded-[var(--delivery-radius)] border border-amber-200 bg-amber-50 px-3 py-2 text-xs text-amber-900">
              {t("store_supabase_unconfigured_hint")}
            </p>
          : null}

          <StoresHomeFeedList
            sections={sections}
            loading={loading}
            emptyFallback={emptyFallback}
            excludeSectionKeys={FEED_EXCLUDE_KEYS}
            hydratedByStoreId={hydratedByStoreId}
            getPhase={getPhase}
            registerListItem={registerListItem}
          />
        </>
      }
      </div>
    </div>
  );
}
