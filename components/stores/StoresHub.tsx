"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { useRefetchOnPageShowRestore } from "@/lib/ui/use-refetch-on-page-show";
import { useRegion } from "@/contexts/RegionContext";
import { getRegionName } from "@/lib/regions/region-utils";
import { KASAMA_BUYER_STORE_ORDERS_HUB_REFRESH } from "@/lib/chats/chat-channel-events";
import { useOwnerHubBadgeTotal } from "@/lib/chats/use-owner-hub-badge-total";
import { OWNER_HUB_BADGE_DOT_CLASS } from "@/lib/chats/hub-badge-ui";
import { useOwnerLiteStore } from "@/lib/stores/use-owner-lite-store";
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

type OrderRowLite = {
  id: string;
  order_status?: string;
  store_name?: string;
  created_at?: string;
};

export function StoresHub() {
  const { primaryRegion } = useRegion();
  const [userGeo, setUserGeo] = useState<{ lat: number; lng: number } | null>(null);
  const { ownerStore, ownerStores, loading: ownerStoresLoading } = useOwnerLiteStore();
  const ownerHubBadge = useOwnerHubBadgeTotal();
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

  useEffect(() => {
    if (typeof navigator === "undefined" || !navigator.geolocation) return;
    navigator.geolocation.getCurrentPosition(
      (pos) => {
        setUserGeo({ lat: pos.coords.latitude, lng: pos.coords.longitude });
      },
      () => {},
      { maximumAge: 300_000, timeout: 10_000 }
    );
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
      const [ordersRes, chatsRes] = await Promise.all([
        fetch("/api/me/store-orders", { credentials: "include", cache: "no-store" }),
        fetch("/api/chat/rooms?segment=order", { credentials: "include", cache: "no-store" }),
      ]);
      if (ordersRes.status === 401) {
        setBuyerOrderSummary({ kind: "idle" });
        setRecentOrder(null);
        return;
      }

      const ordersJson = (await ordersRes.json().catch(() => ({}))) as {
        ok?: boolean;
        orders?: OrderRowLite[];
      };
      const chatsJson = (await chatsRes.json().catch(() => ({}))) as {
        rooms?: Array<{ unreadCount?: number }>;
      };

      const orders = Array.isArray(ordersJson.orders) ? ordersJson.orders : [];
      const rooms = Array.isArray(chatsJson.rooms) ? chatsJson.rooms : [];
      const activeOrders = orders.filter((order) =>
        ["pending", "accepted", "preparing", "delivering", "ready_for_pickup", "arrived"].includes(
          String(order.order_status ?? "")
        )
      ).length;
      const unreadChats = rooms.reduce((sum, room) => sum + Math.max(0, Number(room.unreadCount) || 0), 0);

      const first = orders[0];
      setRecentOrder(
        first?.id ?
          {
            id: String(first.id),
            store_name: String(first.store_name ?? ""),
            order_status: String(first.order_status ?? ""),
            created_at: String(first.created_at ?? ""),
          }
        : null
      );

      setBuyerOrderSummary({
        kind: "ready",
        activeOrders,
        totalOrders: orders.length,
        orderChatRooms: rooms.length,
        unreadChats,
      });
    } catch {
      setBuyerOrderSummary({ kind: "idle" });
      setRecentOrder(null);
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
      <a
        href="#owner-operations"
        className={`relative inline-flex shrink-0 rounded-md px-3 py-1.5 text-[12px] font-semibold ${FB.secondaryBtn}`}
        aria-label={ownerHubBadge > 0 ? `매장 운영 ${ownerHubBadge}건` : "매장 운영"}
      >
        운영
        {ownerHubBadge > 0 ?
          <span className={`${OWNER_HUB_BADGE_DOT_CLASS} ring-[#E4E6EB] dark:ring-[#3A3B3C]`} aria-hidden>
            {ownerHubBadge > 99 ? "99+" : ownerHubBadge}
          </span>
        : null}
      </a>
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
        ownerHubBadge={ownerHubBadge}
      />
    </div>
  );
}
