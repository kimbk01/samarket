import {
  BOTTOM_NAV_ITEMS,
  type BottomNavItemConfig,
} from "@/lib/main-menu/bottom-nav-config";
import { mainBottomNavMessengerTabHref } from "@/lib/community-messenger/messenger-entry-origin";
import { resolveDeliveryOrderHistoryHref } from "@/lib/stores/delivery-order-history-nav";
import type { MessageKey } from "@/lib/i18n/messages";
import type { MainBottomNavSecondaryRailKind } from "@/lib/main-menu/main-bottom-nav-split-layout";

/** 배달 셸 하단 5탭 — 주문내역 · 장바구니 · 배달홈(허브) · 주문채팅 · 내정보 */
export const DELIVERY_BOTTOM_NAV_TAB_IDS = [
  "delivery-orders",
  "delivery-cart",
  "delivery-home-hub",
  "delivery-order-chat",
  "delivery-my",
] as const;

export type DeliveryBottomNavTabId = (typeof DELIVERY_BOTTOM_NAV_TAB_IDS)[number];

/** @deprecated — `composeDeliveryDomainSwitcherSlots` (6슬롯·운영센터) 사용 */
export const DELIVERY_DOMAIN_SWITCHER_ITEMS: readonly BottomNavItemConfig[] = BOTTOM_NAV_ITEMS;

export function isDeliveryBottomNavRail(kind: MainBottomNavSecondaryRailKind): boolean {
  return kind === "stores";
}

export function composeDeliveryBottomNavDisplayTabs(ownerStoreId?: string | null): BottomNavItemConfig[] {
  return [
    {
      id: "delivery-orders",
      href: resolveDeliveryOrderHistoryHref(ownerStoreId),
      label: "Order history",
      labelKey: "nav_bottom_order_history" as MessageKey,
      icon: "orders",
    },
    {
      id: "delivery-cart",
      href: "/stores/cart",
      label: "Cart",
      labelKey: "nav_bottom_cart" as MessageKey,
      icon: "cart",
    },
    {
      id: "delivery-home-hub",
      href: "/stores",
      label: "Delivery home",
      labelKey: "nav_bottom_home" as MessageKey,
      icon: "home",
    },
    {
      id: "delivery-order-chat",
      href: mainBottomNavMessengerTabHref("delivery"),
      label: "Order chat",
      labelKey: "nav_bottom_order_chat" as MessageKey,
      icon: "chat",
      activeShellClass: "bg-sam-primary-soft",
      iconActiveClass: "text-sam-primary",
      labelActiveClass: "font-semibold tracking-normal text-sam-fg",
    },
    {
      id: "delivery-my",
      href: "/mypage/section/store",
      label: "My Page",
      labelKey: "nav_bottom_my",
      icon: "my",
    },
  ];
}
