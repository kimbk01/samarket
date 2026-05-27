"use client";

import type { ReactNode } from "react";
import { usePathname } from "next/navigation";
import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState, startTransition } from "react";
import { buildDeliveryListScrollRouteKey } from "@/lib/dibay/delivery-list-scroll-restore";
import { useDeliveryListScrollRestore } from "@/lib/dibay/use-delivery-list-scroll-restore";
import { useRefetchOnPageShowRestore } from "@/lib/ui/use-refetch-on-page-show";
import { useRegion } from "@/contexts/RegionContext";
import { getRegionName } from "@/lib/regions/region-utils";
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
import { prewarmStoresHomeRoute } from "@/lib/stores/stores-home-route-prewarm";

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
  const querySuffix = useMemo(() => {
    const r = primaryRegion?.regionId ? getRegionName(primaryRegion.regionId).trim() : "";
    const d = primaryRegion?.barangay?.trim() ?? "";
    const q = new URLSearchParams();
    if (r) q.set("region", r);
    if (d) q.set("district", d);
    const s = q.toString();
    return s ? `?${s}` : "";
  }, [primaryRegion]);

  useLayoutEffect(() => {
    prewarmStoresHomeRoute({
      storeHomeFeedSuffixes: querySuffix ? [querySuffix] : [],
    });
  }, [querySuffix]);

  const loadBuyerHub = useCallback(async () => {
    const requestId = ++buyerHubRequestIdRef.current;
    buyerHubAbortRef.current?.abort();
    const controller = new AbortController();
    buyerHubAbortRef.current = controller;
    try {
      const { status: ordersStatus, json: ordersJsonRaw } = await fetchMeStoreOrdersHubSummaryDeduped({
        signal: controller.signal,
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

  useEffect(() => {
    void loadBuyerHub();
  }, [loadBuyerHub]);

  useEffect(() => {
    const onRefresh = () => void loadBuyerHub();
    window.addEventListener(KASAMA_BUYER_STORE_ORDERS_HUB_REFRESH, onRefresh);
    return () => window.removeEventListener(KASAMA_BUYER_STORE_ORDERS_HUB_REFRESH, onRefresh);
  }, [loadBuyerHub]);

  useRefetchOnPageShowRestore(() => void loadBuyerHub());

  useEffect(() => {
    return () => {
      buyerHubAbortRef.current?.abort();
    };
  }, []);

  return (
    <StoresHomeHub
      querySuffix={querySuffix}
      buyerState={buyerOrderSummary}
      recentOrder={recentOrder}
    />
  );
}
