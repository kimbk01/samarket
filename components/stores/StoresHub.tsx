"use client";
import { useI18n } from "@/components/i18n/AppLanguageProvider";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useCallback, useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { buildDeliveryListScrollRouteKey } from "@/lib/dibay/delivery-list-scroll-restore";
import { useDeliveryListScrollRestore } from "@/lib/dibay/use-delivery-list-scroll-restore";
import { useRefetchOnPageShowRestore } from "@/lib/ui/use-refetch-on-page-show";
import { useRegion } from "@/contexts/RegionContext";
import { getRegionName } from "@/lib/regions/region-utils";
import { KASAMA_BUYER_STORE_ORDERS_HUB_REFRESH } from "@/lib/chats/chat-channel-events";
import { useOwnerHubBadgeBreakdown } from "@/lib/chats/use-owner-hub-badge-total";
import { OWNER_HUB_BADGE_DOT_CLASS } from "@/lib/chats/hub-badge-ui";
import { useOwnerLiteStore } from "@/lib/stores/use-owner-lite-store";
import { useStoreBusinessHubEntryModal } from "@/hooks/use-store-business-hub-entry-modal";
import { shouldInterceptBusinessHubHref } from "@/lib/stores/store-business-hub-nav-intercept";
import { resolveOwnerLiteStoreShortcuts } from "@/lib/stores/owner-lite-store-shortcuts";
import { resolveOwnerOperationsCenterAttentionCount } from "@/lib/stores/owner-store-badge-display-policy";
import type { OwnerHubBadgeBreakdown } from "@/lib/chats/owner-hub-badge-types";
import type { StoreRow } from "@/lib/stores/db-store-mapper";
import type {
  RecentOrderPreview,
  StoreOrderDashboardBuyerState,
} from "@/components/stores/home/StoreOrderDashboardSection";
import { StoreCategoryExploreSection } from "@/components/stores/home/StoreCategoryExploreSection";
import { StoreNearbyFeedSection } from "@/components/stores/home/StoreNearbyFeedSection";
import { StorePromoHeroBanner } from "@/components/stores/home/StorePromoHeroBanner";
import { StoreHubMyZoneSection } from "@/components/stores/home/StoreHubMyZoneSection";
import { StoreMyBusinessHubBanner } from "@/components/stores/home/StoreMyBusinessHubBanner";
import { FB } from "@/components/stores/store-facebook-feed-tokens";
import {
  fetchMeStoreOrdersHubSummaryDeduped,
  readMeStoreOrdersHubSummaryCache,
} from "@/lib/stores/store-delivery-api-client";

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

/** 매장주만 마운트 — 허브 진입 모달만 여기서 켜고, 배지 데이터는 부모 구독과 동일 스냅샷을 받습니다 */
function StoresHubOwnerOperChip({
  ownerStore,
  breakdown,
}: {
  ownerStore: StoreRow;
  breakdown: OwnerHubBadgeBreakdown;
}): ReactNode {
  const { openBlockedModalIfNeeded, hubBlockedModal } = useStoreBusinessHubEntryModal("확인");
  const storeOpsAttention = resolveOwnerOperationsCenterAttentionCount(breakdown);
  const ownerOperHref =
    storeOpsAttention > 0
      ? resolveOwnerLiteStoreShortcuts(ownerStore, breakdown).primary.href
      : "#owner-operations";

  return (
    <>
      {hubBlockedModal}
      <Link
        href={ownerOperHref}
        onClick={(e) => {
          if (
            ownerOperHref.startsWith("/") &&
            shouldInterceptBusinessHubHref(ownerOperHref) &&
            openBlockedModalIfNeeded()
          ) {
            e.preventDefault();
          }
        }}
        className={`relative inline-flex shrink-0 rounded-ui-rect px-3 py-1.5 sam-text-helper font-semibold ${FB.secondaryBtn}`}
        aria-label={
          storeOpsAttention > 0 ? `매장 운영 할 일 ${storeOpsAttention}건` : "매장 운영 바로가기"
        }
      >
        운영
        {storeOpsAttention > 0 ? (
          <span className={`${OWNER_HUB_BADGE_DOT_CLASS} ring-[#E4E6EB] dark:ring-[#3A3B3C]`} aria-hidden>
            {storeOpsAttention > 99 ? "99+" : storeOpsAttention}
          </span>
        ) : null}
      </Link>
    </>
  );
}

export function StoresHub() {
  const { t } = useI18n();
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
  const { ownerStore, ownerStores, loading: ownerStoresLoading } = useOwnerLiteStore();
  const ownerHubBreakdown = useOwnerHubBadgeBreakdown();
  const [buyerOrderSummary, setBuyerOrderSummary] = useState<StoreOrderDashboardBuyerState>(
    () => initialHub?.buyerState ?? { kind: "loading" }
  );
  const [recentOrder, setRecentOrder] = useState<RecentOrderPreview | null>(() => initialHub?.recentOrder ?? null);
  const buyerHubRequestIdRef = useRef(0);
  const buyerHubAbortRef = useRef<AbortController | null>(null);
  const [searchInput, setSearchInput] = useState("");
  const [debouncedQ, setDebouncedQ] = useState("");

  useEffect(() => {
    const t = setTimeout(() => setDebouncedQ(searchInput.trim()), 320);
    return () => clearTimeout(t);
  }, [searchInput]);

  const querySuffix = useMemo(() => {
    const r = primaryRegion?.regionId ? getRegionName(primaryRegion.regionId).trim() : "";
    const d = primaryRegion?.barangay?.trim() ?? "";
    const q = new URLSearchParams();
    if (r) q.set("region", r);
    if (d) q.set("district", d);
    const s = q.toString();
    return s ? `?${s}` : "";
  }, [primaryRegion]);

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
      setRecentOrder(next.recentOrder);
      setBuyerOrderSummary(next.buyerState);
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

  const ownerQuickLink =
    ownerStore ?
      <StoresHubOwnerOperChip ownerStore={ownerStore} breakdown={ownerHubBreakdown} />
    : null;

  return (
    <div className={`min-h-[50vh] space-y-3 ${FB.canvas}`}>
      <StoreMyBusinessHubBanner loading={ownerStoresLoading} ownerStores={ownerStores} />

      <StoreCategoryExploreSection headerTrailing={ownerQuickLink} />

      <StorePromoHeroBanner />

      <StoreNearbyFeedSection
        querySuffix={querySuffix}
        ownerStore={ownerStore}
        externalSearchQ={debouncedQ}
      />

      <StoreHubMyZoneSection
        buyerState={buyerOrderSummary}
        recentOrder={recentOrder}
        ownerStore={ownerStore}
        ownerStoreTabAttention={resolveOwnerOperationsCenterAttentionCount(ownerHubBreakdown)}
        ownerOrderAttention={ownerHubBreakdown.orderAttention}
      />
    </div>
  );
}
