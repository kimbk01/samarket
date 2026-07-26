import {
  BOTTOM_NAV_ITEMS,
  type BottomNavItemConfig,
} from "@/lib/main-menu/bottom-nav-config";
import { mainBottomNavMessengerTabHref } from "@/lib/community-messenger/messenger-entry-origin";
import { resolveDeliveryOrderHistoryHref } from "@/lib/delivery/customer/delivery-order-history-nav";
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

/** 배달 5탭 라벨 — `app-bottom-nav.css` `.app-bottom-nav-label--delivery-tab` 과 쌍 */
export const DELIVERY_BOTTOM_NAV_LABEL_CLASS =
  "app-bottom-nav-label app-bottom-nav-label--delivery-tab";

export function isDeliveryBottomNavTabId(tabId: string): tabId is DeliveryBottomNavTabId {
  return (DELIVERY_BOTTOM_NAV_TAB_IDS as readonly string[]).includes(tabId);
}

/** pathname — query·trailing slash 제거 */
export function normalizeDeliveryBottomNavPath(pathname: string | null | undefined): string {
  return (pathname ?? "").split("?")[0]?.trim().replace(/\/+$/, "") || "/";
}

/** 매장 주문 리뷰 작성 — 하단 탭·배달 FAB·허브 우측 액션 제외(폼 CTA 전용) */
export function isStoreOrderReviewPath(pathname: string | null | undefined): boolean {
  const p = normalizeDeliveryBottomNavPath(pathname);
  return (
    /^\/orders\/store\/[^/]+\/review$/.test(p) ||
    /^\/mypage\/store-orders\/[^/]+\/review$/.test(p) ||
    /^\/my\/store-orders\/[^/]+\/review$/.test(p)
  );
}

/**
 * 통합 `BottomNav` 배달 5탭을 쓰는 소비자 화면.
 * - 주문내역 `/orders`·`/mypage/store-orders`
 * - 장바구니 `/stores/cart`
 * - 배달 허브 `/stores`·search·browse
 * (매장 메뉴·슬러그 cart/checkout·오너 `/stores/owner` 는 제외 — 별도 셸/숨김 규칙)
 */
/** 하단 「주문내역」 탭 활성·레일 — 구매자·매장주 주문 목록 */
export function isDeliveryOrderHistoryBottomNavPath(pathname: string | null | undefined): boolean {
  const p = normalizeDeliveryBottomNavPath(pathname);
  if (p === "/orders" || p.startsWith("/orders/")) return true;
  if (p === "/mypage/store-orders" || p.startsWith("/mypage/store-orders/")) return true;
  if (p === "/my/store-orders" || p.startsWith("/my/store-orders/")) return true;
  if (p === "/stores/owner/orders" || p.startsWith("/stores/owner/orders/")) return true;
  return false;
}

/** 하단 「장바구니」 탭 활성 — 통합 장바구니(배달 5탭 노출 화면과 동일 href) */
export function isDeliveryCartBottomNavPath(pathname: string | null | undefined): boolean {
  const p = normalizeDeliveryBottomNavPath(pathname);
  return p === "/stores/cart";
}

/**
 * 통합 `BottomNav` 배달 5탭을 쓰는 소비자 화면.
 * - 주문내역·장바구니·배달 허브(search/browse)
 * (매장 메뉴·슬러그 cart/checkout·오너 `/stores/owner` 는 제외 — 별도 셸/숨김)
 */
export function isDeliveryConsumerBottomNavSurface(pathname: string | null | undefined): boolean {
  const p = normalizeDeliveryBottomNavPath(pathname);
  if (p === "/stores/owner" || p.startsWith("/stores/owner/")) return false;
  if (isDeliveryOrderHistoryBottomNavPath(p)) return true;
  if (isDeliveryCartBottomNavPath(p)) return true;
  if (p === "/stores") return true;
  if (p === "/stores/search" || p.startsWith("/stores/search/")) return true;
  if (p === "/stores/browse" || p.startsWith("/stores/browse/")) return true;
  return false;
}

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
      labelKey: "nav.home" as MessageKey,
      icon: "home",
    },
    {
      id: "delivery-order-chat",
      href: mainBottomNavMessengerTabHref("delivery"),
      label: "Order chat",
      labelKey: "nav_bottom_order_chat" as MessageKey,
      icon: "chat",
    },
    {
      id: "delivery-my",
      href: "/mypage",
      label: "My",
      labelKey: "nav.my",
      icon: "my",
    },
  ];
}
