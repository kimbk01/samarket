import {
  getOwnerBottomNavItemDef,
  OWNER_BOTTOM_NAV_SIDE_LEFT_IDS,
  OWNER_BOTTOM_NAV_SIDE_RIGHT_IDS,
  type OwnerBottomNavTabId,
} from "@/lib/business/owner-nav-registry";
import type { MessageKey } from "@/lib/i18n/messages";
import type { LucideIcon } from "lucide-react";
import {
  ClipboardList,
  Package,
  Settings2,
  Users,
} from "lucide-react";
import { OwnerRoutes } from "@/lib/business/owner-routes";

export type OwnerMobileBottomNavItem = {
  id: OwnerBottomNavTabId;
  labelKey: MessageKey;
  icon: LucideIcon;
  href: (storeId: string, storeSlug?: string | null) => string;
};

const ICON_BY_TAB: Record<Exclude<OwnerBottomNavTabId, "home">, LucideIcon> = {
  orders: ClipboardList,
  products: Package,
  customers: Users,
  manage: Settings2,
};

function toSideItem(id: Exclude<OwnerBottomNavTabId, "home">): OwnerMobileBottomNavItem {
  const def = getOwnerBottomNavItemDef(id);
  return {
    id: def.id,
    labelKey: def.labelKey,
    icon: ICON_BY_TAB[id],
    href: (storeId) => def.href(storeId),
  };
}

/** 배달 5탭 — 좌: 주문·상품 · 중앙: 홈 · 우: 고객·관리 */
export const OWNER_MOBILE_BOTTOM_NAV_SIDE_LEFT: OwnerMobileBottomNavItem[] =
  OWNER_BOTTOM_NAV_SIDE_LEFT_IDS.filter((id): id is Exclude<OwnerBottomNavTabId, "home"> => id !== "home").map(
    toSideItem
  );

export const OWNER_MOBILE_BOTTOM_NAV_SIDE_RIGHT: OwnerMobileBottomNavItem[] =
  OWNER_BOTTOM_NAV_SIDE_RIGHT_IDS.filter((id): id is Exclude<OwnerBottomNavTabId, "home"> => id !== "home").map(
    toSideItem
  );

export const OWNER_MOBILE_BOTTOM_NAV_HOME_LABEL_KEY = "store_owner_bottom_nav_home" as MessageKey;

/** 중앙 「홈」— 운영 대시보드 `/stores/owner` */
export function resolveOwnerMobileBottomNavHomeHref(storeId: string): string {
  return OwnerRoutes.hub(storeId);
}
