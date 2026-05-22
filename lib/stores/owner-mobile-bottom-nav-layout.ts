import { OwnerRoutes } from "@/lib/business/owner-routes";
import type { OwnerBottomNavTabId } from "@/lib/stores/owner-bottom-nav-active";
import type { MessageKey } from "@/lib/i18n/messages";
import type { LucideIcon } from "lucide-react";
import { ClipboardList, MessageCircle, Settings, UtensilsCrossed } from "lucide-react";

export type OwnerMobileBottomNavItem = {
  id: OwnerBottomNavTabId;
  labelKey: MessageKey;
  icon: LucideIcon;
  href: (storeId: string, storeSlug?: string | null) => string;
};

/** 배달 5탭 순서 — 좌: 주문관리·주문채팅 · 중앙: 홈(대시보드) · 우: 메뉴·설정 */
export const OWNER_MOBILE_BOTTOM_NAV_SIDE_LEFT: OwnerMobileBottomNavItem[] = [
  {
    id: "orders",
    labelKey: "store_owner_bottom_nav_orders",
    icon: ClipboardList,
    href: (id) => OwnerRoutes.orders(id),
  },
  {
    id: "order-chat",
    labelKey: "store_owner_bottom_nav_order_chat",
    icon: MessageCircle,
    href: (id) => OwnerRoutes.orderChats(id),
  },
];

export const OWNER_MOBILE_BOTTOM_NAV_SIDE_RIGHT: OwnerMobileBottomNavItem[] = [
  {
    id: "menu",
    labelKey: "store_owner_bottom_nav_menu",
    icon: UtensilsCrossed,
    href: (id) => OwnerRoutes.menu(id),
  },
  {
    id: "settings",
    labelKey: "store_owner_bottom_nav_settings",
    icon: Settings,
    href: (id) => OwnerRoutes.settings(id),
  },
];

export const OWNER_MOBILE_BOTTOM_NAV_HOME_LABEL_KEY = "store_owner_bottom_nav_home" as MessageKey;

/** 중앙 「홈」— 운영 대시보드 `/stores/owner` */
export function resolveOwnerMobileBottomNavHomeHref(storeId: string): string {
  return OwnerRoutes.hub(storeId);
}
