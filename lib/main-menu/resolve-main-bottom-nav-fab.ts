import type { BottomNavItemConfig } from "@/lib/main-menu/bottom-nav-config";
import { mainBottomNavMessengerTabHref } from "@/lib/community-messenger/messenger-entry-origin";
import {
  isDeliveryCartBottomNavPath,
  isDeliveryOrderHistoryBottomNavPath,
  normalizeDeliveryBottomNavPath,
} from "@/lib/main-menu/delivery-bottom-nav-layout";
import {
  generateMainBottomNavFabItemId,
  type MainBottomNavFabDisplayConfig,
  type MainBottomNavFabDisplayItem,
  type MainBottomNavFabStoredConfig,
  type MainBottomNavFabStoredItem,
} from "@/lib/main-menu/main-bottom-nav-fab-types";

/** 1차 FAB 노출 — 배달 홈·장바구니·주문내역 */
export function isMainBottomNavFabDeliverySurface(pathname: string | null | undefined): boolean {
  const p = normalizeDeliveryBottomNavPath(pathname);
  if (p === "/stores") return true;
  if (isDeliveryCartBottomNavPath(p)) return true;
  if (isDeliveryOrderHistoryBottomNavPath(p)) return true;
  return false;
}

export const DEFAULT_DELIVERY_FAB_ITEMS: readonly MainBottomNavFabStoredItem[] = [
  {
    id: "fab_delivery_orders",
    visible: true,
    label: "주문내역",
    href: "/orders",
    icon: "orders",
  },
  {
    id: "fab_delivery_cart",
    visible: true,
    label: "장바구니",
    href: "/stores/cart",
    icon: "cart",
  },
  {
    id: "fab_delivery_order_chat",
    visible: true,
    label: "주문채팅",
    href: mainBottomNavMessengerTabHref("delivery"),
    icon: "chat",
  },
  {
    id: "fab_delivery_home",
    visible: true,
    label: "배달 홈",
    href: "/stores",
    icon: "home",
  },
];

export function getDefaultDeliveryFabConfig(): MainBottomNavFabStoredConfig {
  return {
    enabled: true,
    items: DEFAULT_DELIVERY_FAB_ITEMS.map((item) => ({ ...item })),
  };
}

function isDeliveryParentTab(tab: Pick<BottomNavItemConfig, "id" | "href">): boolean {
  if (tab.id === "stores") return true;
  const href = tab.href.split("?")[0]?.trim() ?? "";
  return href === "/stores" || href.startsWith("/stores/");
}

function toFabDisplayItems(items: MainBottomNavFabStoredItem[]): MainBottomNavFabDisplayItem[] {
  return items
    .filter((item) => item.visible !== false)
    .map(({ visible: _v, ...rest }) => rest);
}

function resolveEffectiveTabFab(tab: Pick<BottomNavItemConfig, "id" | "href" | "fab">): MainBottomNavFabStoredConfig | null {
  if (tab.fab != null) {
    if (tab.fab.enabled !== true) return null;
    if (Array.isArray(tab.fab.items) && tab.fab.items.length > 0) return tab.fab;
    return null;
  }
  if (isDeliveryParentTab(tab)) {
    return getDefaultDeliveryFabConfig();
  }
  return null;
}

/** 현재 경로에 매칭되는 부모 탭의 FAB config */
export function resolveMainBottomNavFabForPath(
  pathname: string | null | undefined,
  tabs: readonly BottomNavItemConfig[]
): MainBottomNavFabDisplayConfig | null {
  if (!isMainBottomNavFabDeliverySurface(pathname)) return null;

  const parent = tabs.find(isDeliveryParentTab);
  const fabSource = parent ?? { id: "stores", href: "/stores" as const, fab: getDefaultDeliveryFabConfig() };

  const fab = resolveEffectiveTabFab(fabSource);
  if (!fab) return null;

  const items = toFabDisplayItems(fab.items);
  if (items.length === 0) return null;

  return { parentTabId: fabSource.id, items };
}

export function isMainBottomNavFabHrefActive(
  pathname: string | null | undefined,
  href: string
): boolean {
  const p = normalizeDeliveryBottomNavPath(pathname);
  const target = href.split("?")[0]?.trim().replace(/\/+$/, "") || "/";
  if (target === "/orders") return isDeliveryOrderHistoryBottomNavPath(p);
  if (target === "/stores/cart") return isDeliveryCartBottomNavPath(p);
  if (target === "/stores") return p === "/stores";
  if (p === target || p.startsWith(`${target}/`)) return true;
  const qIdx = href.indexOf("?");
  if (qIdx >= 0) {
    const base = href.slice(0, qIdx);
    return p === base || p.startsWith(`${base}/`);
  }
  return false;
}

/** 관리자 FAB 항목 추가 시 기본 행 */
export function createDefaultMainBottomNavFabItem(label = "새 메뉴"): MainBottomNavFabStoredItem {
  return {
    id: generateMainBottomNavFabItemId(),
    visible: true,
    label,
    href: "/stores",
    icon: "home",
  };
}
