"use client";

import type { BottomNavItemConfig } from "@/lib/main-menu/bottom-nav-config";
import {
  BOTTOM_NAV_ICON_KEY_BRAND,
  MAIN_BOTTOM_NAV_TAB_ICONS,
} from "@/components/main-menu/MainBottomNavTabIcons";
import { resolveLucideBottomNavIcon } from "@/lib/main-menu/lucide-bottom-nav-icon-registry";
import { ServiceBrandIcon } from "@/components/brand/ServiceBrandIcon";

type MainBottomNavTabIconProps = {
  tab: Pick<BottomNavItemConfig, "icon" | "lucideIcon">;
  className?: string;
  /**
   * 메인 하단 탭 선택 상태 — 서비스 키는 선택 = 채움 · 비선택 = 외곽선 (Owner 2026-11-15 「네이버형 채움↔외곽선」).
   * 넘기지 않으면(FAB·Admin·배달 스위처) 지금처럼 채움.
   */
  selected?: boolean;
};

/**
 * 하단 탭 아이콘 — 서비스 키(home·community·trade·stores·chat·my)는 브랜드 대표 아이콘 고정
 * (같은 브랜드 = 같은 그림, Owner 2026-11-13). 그 밖의 키만 Lucide(운영 선택) 우선, 없으면 앱 기본 SVG.
 */
export function MainBottomNavTabIcon({ tab, className, selected }: MainBottomNavTabIconProps) {
  const brand = BOTTOM_NAV_ICON_KEY_BRAND[tab.icon];
  if (brand) {
    return (
      <ServiceBrandIcon
        brand={brand}
        className={className}
        variant={selected === false ? "outline" : "fill"}
      />
    );
  }
  if (tab.lucideIcon) {
    const LucideIcon = resolveLucideBottomNavIcon(tab.lucideIcon);
    if (LucideIcon) return <LucideIcon className={className} aria-hidden />;
  }
  const BuiltinIcon = MAIN_BOTTOM_NAV_TAB_ICONS[tab.icon];
  return <BuiltinIcon className={className} aria-hidden />;
}

export function mainBottomNavIconLabel(tab: Pick<BottomNavItemConfig, "icon" | "lucideIcon">): string {
  /** 서비스 키는 Lucide 를 무시하고 대표 아이콘을 그리므로 이름도 실제 그림(키)을 보여 준다 */
  if (tab.lucideIcon && !BOTTOM_NAV_ICON_KEY_BRAND[tab.icon]) return tab.lucideIcon;
  return tab.icon;
}
