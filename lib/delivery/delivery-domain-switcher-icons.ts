import type { ComponentType } from "react";
import type { BottomNavIconKey } from "@/lib/main-menu/bottom-nav-config";
import {
  MAIN_BOTTOM_NAV_TAB_ICONS,
  type MainBottomNavIconProps,
  StoreOpsCenterStrokeIcon,
} from "@/components/main-menu/MainBottomNavTabIcons";

export type DeliveryDialIconKey = BottomNavIconKey | "owner_hub";

export function resolveDeliveryDialIconComponent(
  icon: DeliveryDialIconKey
): ComponentType<MainBottomNavIconProps> {
  if (icon === "owner_hub") return StoreOpsCenterStrokeIcon;
  if (icon === "home") return MAIN_BOTTOM_NAV_TAB_ICONS.trade;
  return MAIN_BOTTOM_NAV_TAB_ICONS[icon] ?? MAIN_BOTTOM_NAV_TAB_ICONS.stores;
}
