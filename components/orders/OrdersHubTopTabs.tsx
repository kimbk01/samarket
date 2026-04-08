"use client";

/**
 * 주문 허브 상단 탭 — 뷰포트 풀폭 3등분, 폰트는 `ChatHubTopTabs`와 동일
 * 채팅 탭 문구는 `lib/chats/surfaces/order-chat-surface.ts` 의 `ordersHubTabLabel` 만 조정.
 */
import type { ReactNode } from "react";
import { useCallback, useLayoutEffect, useRef, useState } from "react";
import { useI18n } from "@/components/i18n/AppLanguageProvider";
import { ORDER_CHAT_SURFACE } from "@/lib/chats/surfaces/order-chat-surface";

export type OrdersHubTabId = "store" | "chat" | "purchases";

const TABS: { id: OrdersHubTabId; label: string; labelKey?: "nav_orders_tab_store" | "nav_orders_tab_purchases" | "nav_chat_order_compact" }[] = [
  { id: "store", label: "배달주문", labelKey: "nav_orders_tab_store" },
  { id: "chat", label: ORDER_CHAT_SURFACE.ordersHubTabLabel, labelKey: ORDER_CHAT_SURFACE.ordersHubTabLabelKey },
  { id: "purchases", label: "중고 구매 내역", labelKey: "nav_orders_tab_purchases" },
];

/** 상단 탭 순서 — 스와이프 전환과 동일 */
export const ORDERS_HUB_TAB_ORDER: readonly OrdersHubTabId[] = TABS.map((t) => t.id);

export function OrdersHubTopTabs({
  active,
  onSelect,
  onSwipeTouchStart,
  onSwipeTouchEnd,
  trailing,
}: {
  active: OrdersHubTabId;
  onSelect: (id: OrdersHubTabId) => void;
  /** 모바일 좌우 스와이프로 탭 전환(본문과 동일 제스처) */
  onSwipeTouchStart?: (e: React.TouchEvent) => void;
  onSwipeTouchEnd?: (e: React.TouchEvent) => void;
  /** 탭 줄 오른쪽 끝(예: 매장 관리 햄버거) */
  trailing?: ReactNode;
}) {
  const { t, tt } = useI18n();
  const outerRef = useRef<HTMLDivElement>(null);
  const tabRefs = useRef<Record<OrdersHubTabId, HTMLButtonElement | null>>({
    store: null,
    chat: null,
    purchases: null,
  });
  const [indicator, setIndicator] = useState({ left: 0, width: 0 });

  const updateIndicator = useCallback(() => {
    const outer = outerRef.current;
    const tab = tabRefs.current[active];
    if (!outer || !tab) return;
    const o = outer.getBoundingClientRect();
    const t = tab.getBoundingClientRect();
    setIndicator({ left: t.left - o.left, width: t.width });
  }, [active]);

  useLayoutEffect(() => {
    updateIndicator();
    const outer = outerRef.current;
    const ro = new ResizeObserver(() => updateIndicator());
    if (outer) ro.observe(outer);
    window.addEventListener("resize", updateIndicator);
    return () => {
      ro.disconnect();
      window.removeEventListener("resize", updateIndicator);
    };
  }, [active, updateIndicator]);

  useLayoutEffect(() => {
    requestAnimationFrame(updateIndicator);
  }, [active, updateIndicator]);

  return (
    <div
      className="flex w-full min-w-0 touch-pan-y border-t border-black/[0.08] bg-white"
      onTouchStart={onSwipeTouchStart}
      onTouchEnd={onSwipeTouchEnd}
    >
      <div ref={outerRef} className="relative min-w-0 flex-1">
        <div
          role="tablist"
          aria-label={t("nav_orders_tab_aria")}
          className="flex h-[55px] w-full min-w-0 items-stretch"
        >
          {TABS.map(({ id, label, labelKey }) => {
            const isOn = active === id;
            return (
              <button
                key={id}
                type="button"
                role="tab"
                aria-selected={isOn}
                ref={(el) => {
                  tabRefs.current[id] = el;
                }}
                onClick={() => onSelect(id)}
                className={[
                  "flex min-h-0 min-w-0 flex-1 flex-col items-center justify-center px-1 text-center text-[14px] leading-snug transition-colors duration-200 [text-wrap:balance] sm:px-1.5 sm:text-[15px]",
                  isOn ? "font-semibold text-gray-900" : "font-medium text-gray-500 hover:text-gray-700",
                ].join(" ")}
              >
                {labelKey ? t(labelKey) : tt(label)}
              </button>
            );
          })}
        </div>
        <div
          className="pointer-events-none absolute bottom-0 h-0.5 rounded-full bg-gray-900 transition-[left,width] duration-300 ease-out"
          style={{ left: indicator.left, width: indicator.width }}
          aria-hidden
        />
      </div>
      {trailing}
    </div>
  );
}

export function parseOrdersHubTabParam(raw: string | null): OrdersHubTabId {
  if (raw === "chat" || raw === "purchases" || raw === "store") return raw;
  return "store";
}
