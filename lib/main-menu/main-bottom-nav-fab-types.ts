import type { BottomNavIconKey } from "@/lib/main-menu/bottom-nav-config";

/** FAB 서브메뉴 한 행 — 하단 탭 5~6개 한도를 넘는 보조 진입 */
export type MainBottomNavFabStoredItem = {
  id: string;
  visible: boolean;
  label: string;
  href: string;
  icon: BottomNavIconKey;
  openInNewTab?: boolean;
  lucideIcon?: string;
};

export type MainBottomNavFabStoredConfig = {
  enabled: boolean;
  items: MainBottomNavFabStoredItem[];
};

/** 런타임 FAB 표시용 */
export type MainBottomNavFabDisplayItem = {
  id: string;
  label: string;
  href: string;
  icon: BottomNavIconKey;
  openInNewTab?: boolean;
  lucideIcon?: string;
};

export type MainBottomNavFabDisplayConfig = {
  parentTabId: string;
  items: MainBottomNavFabDisplayItem[];
};

export const MAIN_BOTTOM_NAV_FAB_MAX_ITEMS = 8;

export const FAB_ITEM_ID_RE = /^fab_[a-zA-Z0-9_-]{1,48}$/;

export function generateMainBottomNavFabItemId(): string {
  return `fab_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 9)}`;
}
