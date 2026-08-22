"use client";

import { usePathname } from "next/navigation";
import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState, startTransition, useSyncExternalStore } from "react";
import { buildDeliveryListScrollRouteKey } from "@/lib/dibay/delivery-list-scroll-restore";
import { useDeliveryListScrollRestore } from "@/lib/dibay/use-delivery-list-scroll-restore";
import { useRefetchOnPageShowRestore } from "@/lib/ui/use-refetch-on-page-show";
import { useI18n } from "@/components/i18n/AppLanguageProvider";
import { useRegion } from "@/contexts/RegionContext";
import {
  getAppBootSnapshot,
  isAppBootReady,
  subscribeAppBoot,
} from "@/lib/app-boot/app-boot-store";
import {
  getAppBootProfileFetchCacheEpoch,
  subscribeAppBootProfileFetchCache,
} from "@/lib/app-boot/fetch-app-boot-profile";
import { KASAMA_BUYER_STORE_ORDERS_HUB_REFRESH } from "@/lib/chats/chat-channel-events";
import type {
  RecentOrderPreview,
  StoreOrderDashboardBuyerState,
} from "@/components/stores/home/StoreOrderDashboardSection";
import { StoresHomeHub } from "@/components/stores/home/hub/StoresHomeHub";
import {
  fetchMeStoreOrdersHubSummaryDeduped,
  readMeStoreOrdersHubSummaryCache,
} from "@/lib/stores/store-delivery-api-client";
import { resolveStoresHomeFeedQueryGate } from "@/lib/stores/stores-home-feed-query-gate";
import { prewarmStoresHomeRoute } from "@/lib/stores/stores-home-route-prewarm";
import { addStoresHomePullRefreshHandler } from "@/lib/stores/stores-home-pull-refresh-store";
import { shouldSkipStoresHomeHubSummaryFetch } from "@/lib/stores/stores-home-network-guards";

type StoreHubSummaryResponse = {
  ok?: boolean;
  hub_summary?: {
    activeOrders?: number;
    totalOrders?: number;
    orderChatRooms?: number;
    unreadChats?: number;
    recent?: RecentOrderPreview | null;
  };
};

function resolveBuyerHubFromJson(
  status: number,
  jsonRaw: unknown
): { buyerState: StoreOrderDashboardBuyerState; recentOrder: RecentOrderPreview | null } {
  if (status === 401) return { buyerState: { kind: "idle" }, recentOrder: null };
  const ordersJson = jsonRaw as StoreHubSummaryResponse;
  const hub = ordersJson?.hub_summary;
  if (!ordersJson?.ok || !hub) {
    return { buyerState: { kind: "idle" }, recentOrder: null };
  }
  return {
    recentOrder: hub.recent && hub.recent.id ? hub.recent : null,
    buyerState: {
      kind: "ready",
      activeOrders: Math.max(0, Number(hub.activeOrders) || 0),
      totalOrders: Math.max(0, Number(hub.totalOrders) || 0),
      orderChatRooms: Math.max(0, Number(hub.orderChatRooms) || 0),
      unreadChats: Math.max(0, Number(hub.unreadChats) || 0),
    },
  };
}

export function StoresHub() {
  const { language } = useI18n();
  const pathname = usePathname();
  const listScrollRouteKey = useMemo(
    () => buildDeliveryListScrollRouteKey(pathname ?? "/stores", ""),
    [pathname]
  );
  useDeliveryListScrollRestore(listScrollRouteKey, true);

  const cachedHubSnapshot = readMeStoreOrdersHubSummaryCache();
  const initialHub =
    cachedHubSnapshot.value ?
      resolveBuyerHubFromJson(cachedHubSnapshot.value.status, cachedHubSnapshot.value.json)
    : null;
  const { primaryRegion } = useRegion();
  const [buyerOrderSummary, setBuyerOrderSummary] = useState<StoreOrderDashboardBuyerState>(
    () => initialHub?.buyerState ?? { kind: "loading" }
  );
  const [recentOrder, setRecentOrder] = useState<RecentOrderPreview | null>(() => initialHub?.recentOrder ?? null);
  const buyerHubRequestIdRef = useRef(0);
  const buyerHubAbortRef = useRef<AbortController | null>(null);
  /**
   * CUT-A — recompute feed gate on any boot store emit (ready|anonymous|hydrating|shell).
   * DO NOT rely only on APP_BOOT_READY_EVENT: missed event / late mount left feedReady=0 forever.
   */
  const bootStatus = useSyncExternalStore(
    subscribeAppBoot,
    () => getAppBootSnapshot().status,
    () => "idle"
  );
  const bootReady = useSyncExternalStore(
    subscribeAppBoot,
    () => isAppBootReady(),
    () => false
  );
  /** CUT-B — re-resolve when profile-lite cache lands (public feed before boot ready). */
  const profileLiteEpoch = useSyncExternalStore(
    subscribeAppBootProfileFetchCache,
    getAppBootProfileFetchCacheEpoch,
    () => 0
  );
  const feedGate = useMemo(
    () => resolveStoresHomeFeedQueryGate(primaryRegion),
    [primaryRegion, bootStatus, bootReady, profileLiteEpoch]
  );
  const querySuffix = feedGate.querySuffix;
  const feedReady = feedGate.ready;

  useLayoutEffect(() => {
    if (!feedReady) return;
    prewarmStoresHomeRoute({
      storeHomeFeedSuffixes: querySuffix ? [querySuffix] : [],
      language,
    });
  }, [language, querySuffix, feedReady]);

  const loadBuyerHub = useCallback(async (opts?: { force?: boolean; fromBfcacheRestore?: boolean }) => {
    if (shouldSkipStoresHomeHubSummaryFetch(opts)) {
      const snap = readMeStoreOrdersHubSummaryCache();
      if (snap.value) {
        const next = resolveBuyerHubFromJson(snap.value.status, snap.value.json);
        startTransition(() => {
          setRecentOrder(next.recentOrder);
          setBuyerOrderSummary(next.buyerState);
        });
      }
      return;
    }
    const requestId = ++buyerHubRequestIdRef.current;
    buyerHubAbortRef.current?.abort();
    const controller = new AbortController();
    buyerHubAbortRef.current = controller;
    try {
      const { status: ordersStatus, json: ordersJsonRaw } = await fetchMeStoreOrdersHubSummaryDeduped({
        signal: controller.signal,
        force: opts?.force,
      });
      if (controller.signal.aborted || requestId !== buyerHubRequestIdRef.current) return;
      const next = resolveBuyerHubFromJson(ordersStatus, ordersJsonRaw);
      startTransition(() => {
        setRecentOrder(next.recentOrder);
        setBuyerOrderSummary(next.buyerState);
      });
    } catch (error) {
      if (error instanceof DOMException && error.name === "AbortError") return;
      if (controller.signal.aborted || requestId !== buyerHubRequestIdRef.current) return;
      setBuyerOrderSummary({ kind: "idle" });
      setRecentOrder((prev) => (prev === null ? prev : null));
    } finally {
      if (buyerHubAbortRef.current === controller) {
        buyerHubAbortRef.current = null;
      }
    }
  }, []);

  useLayoutEffect(() => {
    return addStoresHomePullRefreshHandler(async () => {
      await loadBuyerHub({ force: true });
    });
  }, [loadBuyerHub]);

  useEffect(() => {
    if (readMeStoreOrdersHubSummaryCache().isFresh) return;
    void loadBuyerHub();
  }, [loadBuyerHub]);

  useEffect(() => {
    const onRefresh = () => void loadBuyerHub();
    window.addEventListener(KASAMA_BUYER_STORE_ORDERS_HUB_REFRESH, onRefresh);
    return () => window.removeEventListener(KASAMA_BUYER_STORE_ORDERS_HUB_REFRESH, onRefresh);
  }, [loadBuyerHub]);

  useRefetchOnPageShowRestore(() => void loadBuyerHub({ fromBfcacheRestore: true }), {
    enableVisibilityRefetch: false,
  });

  useEffect(() => {
    return () => {
      buyerHubAbortRef.current?.abort();
    };
  }, []);

  return (
    <StoresHomeHub
      querySuffix={querySuffix}
      feedReady={feedReady}
      buyerState={buyerOrderSummary}
      recentOrder={recentOrder}
    />
  );
}
