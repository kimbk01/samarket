"use client";

import { useCallback, useMemo, useRef } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { useI18n } from "@/components/i18n/AppLanguageProvider";
import { CommerceCartHeaderLink } from "@/components/layout/CommerceCartHeaderLink";
import { AppTopHeader } from "@/components/app-shell";
import { MyStoreOrdersView } from "@/components/mypage/MyStoreOrdersView";
import { PurchasesView } from "@/components/mypage/PurchasesView";
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
  const { tt } = useI18n();
  const router = useRouter();
  const searchParams = useSearchParams();

  const tab = useMemo(
    () => parseOrdersHubTabParam(searchParams.get("tab")),
    [searchParams]
  );

  /**
   * `tab=chat`·`room=` 는 `app/(main)/orders/page.tsx` 서버에서 `/chats/...` 또는 `/my/store-orders` 로 리다이렉트.
   * 여기서 클라 `router.replace` 를 또 쓰면 이중 네비·깜빡임만 생김.
   */

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
    <div className="flex min-h-screen flex-col bg-sam-app">
      <AppTopHeader
        hidePrimaryRow={false}
        hideBackButton
        title={tt("주문")}
        backButtonProps={{
          preferHistoryBack: true,
          backHref: "/home",
          ariaLabel: tt("이전 화면"),
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
