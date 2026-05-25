"use client";

import type { BottomNavItemConfig } from "@/lib/main-menu/bottom-nav-config";
import { MAIN_BOTTOM_NAV_TAB_ICONS } from "@/components/main-menu/MainBottomNavTabIcons";
import { resolveLucideBottomNavIcon } from "@/lib/main-menu/lucide-bottom-nav-icon-registry";

type MainBottomNavTabIconProps = {
  tab: Pick<BottomNavItemConfig, "icon" | "lucideIcon">;
  className?: string;
};

/** 하단 탭 아이콘 — Lucide(운영 선택) 우선, 없으면 앱 기본 SVG */
export function MainBottomNavTabIcon({ tab, className }: MainBottomNavTabIconProps) {
  if (tab.lucideIcon) {
    const LucideIcon = resolveLucideBottomNavIcon(tab.lucideIcon);
    if (LucideIcon) return <LucideIcon className={className} aria-hidden />;
  }
  const BuiltinIcon = MAIN_BOTTOM_NAV_TAB_ICONS[tab.icon];
  return <BuiltinIcon className={className} aria-hidden />;
}

export function mainBottomNavIconLabel(tab: Pick<BottomNavItemConfig, "icon" | "lucideIcon">): string {
  if (tab.lucideIcon) return tab.lucideIcon;
  return tab.icon;
}
