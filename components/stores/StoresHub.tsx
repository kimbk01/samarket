"use client";

import Link from "next/link";
import { useCallback, useEffect, useMemo, useState, type ReactNode } from "react";
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
import type { OwnerHubBadgeBreakdown } from "@/lib/chats/owner-hub-badge-types";
import type { StoreRow } from "@/lib/stores/db-store-mapper";
import type {
  RecentOrderPreview,
  StoreOrderDashboardBuyerState,
} from "@/components/stores/home/StoreOrderDashboardSection";
import { StoreCategoryExploreSection } from "@/components/stores/home/StoreCategoryExploreSection";
import { StoreNearbyFeedSection } from "@/components/stores/home/StoreNearbyFeedSection";
import { StoreHubSearchStrip } from "@/components/stores/home/StoreHubSearchStrip";
import { StorePromoHeroBanner } from "@/components/stores/home/StorePromoHeroBanner";
import { StoreMemberQuickActions } from "@/components/stores/home/StoreMemberQuickActions";
import { StoreHubMyZoneSection } from "@/components/stores/home/StoreHubMyZoneSection";
import { StoreMyBusinessHubBanner } from "@/components/stores/home/StoreMyBusinessHubBanner";
import { FB } from "@/components/stores/store-facebook-feed-tokens";
import {
  cancelScheduledWhenBrowserIdle,
  isConstrainedNetwork,
  scheduleWhenBrowserIdle,
} from "@/lib/ui/network-policy";
import { fetchMeStoreOrdersHubSummaryDeduped } from "@/lib/stores/store-delivery-api-client";

/** 매장주만 마운트 — 허브 진입 모달만 여기서 켜고, 배지 데이터는 부모 구독과 동일 스냅샷을 받습니다 */
function StoresHubOwnerOperChip({
  ownerStore,
  breakdown,
}: {
  ownerStore: StoreRow;
  breakdown: OwnerHubBadgeBreakdown;
}): ReactNode {
  const { openBlockedModalIfNeeded, hubBlockedModal } = useStoreBusinessHubEntryModal("확인");
  const storeOpsAttention = breakdown.storesTabAttention;
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
  const { primaryRegion } = useRegion();
  const [userGeo, setUserGeo] = useState<{ lat: number; lng: number } | null>(null);
  const { ownerStore, ownerStores, loading: ownerStoresLoading } = useOwnerLiteStore();
  const ownerHubBreakdown = useOwnerHubBadgeBreakdown();
  const [buyerOrderSummary, setBuyerOrderSummary] = useState<StoreOrderDashboardBuyerState>({
    kind: "loading",
  });
  const [recentOrder, setRecentOrder] = useState<RecentOrderPreview | null>(null);
  const [searchInput, setSearchInput] = useState("");
  const [debouncedQ, setDebouncedQ] = useState("");

  useEffect(() => {
    const t = setTimeout(() => setDebouncedQ(searchInput.trim()), 320);
    return () => clearTimeout(t);
  }, [searchInput]);

  /** 첫 페인트·허브 요약과 경합하지 않도록 위치는 idle 이후 요청 — 권한/GPS 비용 분산 */
  useEffect(() => {
    if (typeof navigator === "undefined" || !navigator.geolocation) return;
    const idleId = scheduleWhenBrowserIdle(() => {
      navigator.geolocation.getCurrentPosition(
        (pos) => {
          setUserGeo({ lat: pos.coords.latitude, lng: pos.coords.longitude });
        },
        () => {},
        { maximumAge: 300_000, timeout: 10_000 }
      );
    }, isConstrainedNetwork() ? 2800 : 1400);
    return () => cancelScheduledWhenBrowserIdle(idleId);
  }, []);

  const querySuffix = useMemo(() => {
    const r = primaryRegion?.regionId ? getRegionName(primaryRegion.regionId).trim() : "";
    const d = primaryRegion?.barangay?.trim() ?? "";
    const q = new URLSearchParams();
    if (r) q.set("region", r);
    if (d) q.set("district", d);
    if (userGeo) {
      q.set("user_lat", String(userGeo.lat));
      q.set("user_lng", String(userGeo.lng));
    }
    const s = q.toString();
    return s ? `?${s}` : "";
  }, [primaryRegion, userGeo]);

  const loadBuyerHub = useCallback(async () => {
    try {
      const { status: ordersStatus, json: ordersJsonRaw } = await fetchMeStoreOrdersHubSummaryDeduped();
      if (ordersStatus === 401) {
        setBuyerOrderSummary({ kind: "idle" });
        setRecentOrder((prev) => (prev === null ? prev : null));
        return;
      }

      const ordersJson = ordersJsonRaw as {
        ok?: boolean;
        hub_summary?: {
          activeOrders?: number;
          totalOrders?: number;
          orderChatRooms?: number;
          unreadChats?: number;
          recent?: RecentOrderPreview | null;
        };
      };

      const hub = ordersJson.hub_summary;
      if (!ordersJson.ok || !hub) {
        setBuyerOrderSummary({ kind: "idle" });
        setRecentOrder((prev) => (prev === null ? prev : null));
        return;
      }

      setRecentOrder(hub.recent && hub.recent.id ? hub.recent : null);

      setBuyerOrderSummary({
        kind: "ready",
        activeOrders: Math.max(0, Number(hub.activeOrders) || 0),
        totalOrders: Math.max(0, Number(hub.totalOrders) || 0),
        orderChatRooms: Math.max(0, Number(hub.orderChatRooms) || 0),
        unreadChats: Math.max(0, Number(hub.unreadChats) || 0),
      });
    } catch {
      setBuyerOrderSummary({ kind: "idle" });
      setRecentOrder((prev) => (prev === null ? prev : null));
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

  const activeStoreOrderBadge =
    buyerOrderSummary.kind === "ready" ? buyerOrderSummary.activeOrders : 0;

  const ownerQuickLink =
    ownerStore ?
      <StoresHubOwnerOperChip ownerStore={ownerStore} breakdown={ownerHubBreakdown} />
    : null;

  return (
    <div className={`min-h-[50vh] space-y-3 ${FB.canvas}`}>
      <StoreHubSearchStrip value={searchInput} onChange={setSearchInput} />

      <StoreMemberQuickActions activeStoreOrderCount={activeStoreOrderBadge} />

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
        ownerStoreTabAttention={ownerHubBreakdown.storesTabAttention}
        ownerOrderAttention={ownerHubBreakdown.orderAttention}
      />
    </div>
  );
}
