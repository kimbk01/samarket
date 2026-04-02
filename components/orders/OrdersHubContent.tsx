"use client";

import { useCallback, useLayoutEffect, useMemo, useRef } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { CommerceCartHeaderLink } from "@/components/layout/CommerceCartHeaderLink";
import { TradePrimaryColumnStickyAppBar } from "@/components/layout/TradePrimaryColumnStickyAppBar";
import { MyStoreOrdersView } from "@/components/mypage/MyStoreOrdersView";
import { PurchasesView } from "@/components/mypage/PurchasesView";
import { parseRoomId } from "@/lib/validate-params";
import {
  ORDERS_HUB_TAB_ORDER,
  OrdersHubTopTabs,
  parseOrdersHubTabParam,
  type OrdersHubTabId,
} from "@/components/orders/OrdersHubTopTabs";
import { OrdersHubStoreAdminMenuTrigger } from "@/components/orders/OrdersHubStoreAdminAccess";

const SWIPE_MIN_DX = 56;

function neighborOrdersHubTab(current: OrdersHubTabId, delta: -1 | 1): OrdersHubTabId | null {
  const i = ORDERS_HUB_TAB_ORDER.indexOf(current);
  if (i < 0) return null;
  const j = i + delta;
  if (j < 0 || j >= ORDERS_HUB_TAB_ORDER.length) return null;
  return ORDERS_HUB_TAB_ORDER[j] ?? null;
}

export function OrdersHubContent() {
  const router = useRouter();
  const searchParams = useSearchParams();

  const tab = useMemo(
    () => parseOrdersHubTabParam(searchParams.get("tab")),
    [searchParams]
  );

  const roomQueryRaw = searchParams.get("room");
  const reviewQueryRaw = searchParams.get("review");

  /**
   * 레거시 `/orders?tab=chat&room=` → `/chats/[roomId]`.
   * 목록만 있는 `/orders?tab=chat` → 구매자 배달 내 주문 `/my/store-orders`.
   */
  useLayoutEffect(() => {
    if (tab !== "chat") return;
    const roomId = parseRoomId(roomQueryRaw);
    if (roomId) {
      const qs = reviewQueryRaw === "1" ? "?review=1" : "";
      router.replace(`/chats/${encodeURIComponent(roomId)}${qs}`, { scroll: false });
      return;
    }
    router.replace("/my/store-orders", { scroll: false });
  }, [tab, roomQueryRaw, reviewQueryRaw, router]);

  const onSelectTab = useCallback(
    (id: OrdersHubTabId) => {
      if (id === "store") {
        router.replace("/orders", { scroll: false });
        return;
      }
      if (id === "chat") {
        router.replace("/my/store-orders", { scroll: false });
        return;
      }
      router.replace(`/orders?tab=${encodeURIComponent(id)}`, { scroll: false });
    },
    [router]
  );

  const touchStartRef = useRef<{ x: number; y: number } | null>(null);

  const onSwipeTouchStart = useCallback((e: React.TouchEvent) => {
    const t = e.changedTouches[0];
    if (!t) return;
    touchStartRef.current = { x: t.clientX, y: t.clientY };
  }, []);

  const onSwipeTouchEnd = useCallback(
    (e: React.TouchEvent) => {
      const start = touchStartRef.current;
      touchStartRef.current = null;
      if (!start) return;
      const t = e.changedTouches[0];
      if (!t) return;
      const dx = t.clientX - start.x;
      const dy = t.clientY - start.y;
      if (Math.abs(dx) < SWIPE_MIN_DX) return;
      if (Math.abs(dx) <= Math.abs(dy)) return;
      if (dx < 0) {
        const next = neighborOrdersHubTab(tab, 1);
        if (next) onSelectTab(next);
      } else {
        const prev = neighborOrdersHubTab(tab, -1);
        if (prev) onSelectTab(prev);
      }
    },
    [tab, onSelectTab]
  );

  return (
    <div className="flex min-h-screen flex-col bg-gray-50">
      <TradePrimaryColumnStickyAppBar
        hidePrimaryRow={false}
        hideBackButton
        title="주문"
        backButtonProps={{
          preferHistoryBack: true,
          backHref: "/home",
          ariaLabel: "이전 화면",
        }}
        actions={<CommerceCartHeaderLink />}
        shellFooter={
          <OrdersHubTopTabs
            active={tab}
            onSelect={onSelectTab}
            onSwipeTouchStart={onSwipeTouchStart}
            onSwipeTouchEnd={onSwipeTouchEnd}
            trailing={<OrdersHubStoreAdminMenuTrigger />}
          />
        }
      />

      <div className="touch-pan-y mt-1" onTouchStart={onSwipeTouchStart} onTouchEnd={onSwipeTouchEnd}>
        {tab === "store" ? <MyStoreOrdersView embedded /> : null}
        {tab === "purchases" ? (
          <div className="mx-auto max-w-lg px-4 py-3 pb-24">
            <PurchasesView />
          </div>
        ) : null}
      </div>
    </div>
  );
}
