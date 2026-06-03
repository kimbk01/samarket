import type { AdminMenuItem as SidebarAdminMenuItem } from "@/components/admin/admin-menu";

/** 사이드바 메뉴 트리에서 key 로 항목 검색 (중첩 포함) */
export function findAdminMenuByKey(
  menu: SidebarAdminMenuItem[],
  key: string
): SidebarAdminMenuItem | undefined {
  for (const item of menu) {
    if (item.key === key) return item;
    if (item.children?.length) {
      const found = findAdminMenuByKey(item.children, key);
      if (found) return found;
    }
  }
  return undefined;
}

export function requireAdminMenuByKey(
  menu: SidebarAdminMenuItem[],
  key: string
): SidebarAdminMenuItem {
  const item = findAdminMenuByKey(menu, key);
  if (!item) {
    throw new Error(`Missing admin menu key: ${key}`);
  }
  return item;
}

/** 최상위 key 의 직계 children 만 (없으면 빈 배열) */
export function topLevelChildrenByKey(
  menu: SidebarAdminMenuItem[],
  key: string
): SidebarAdminMenuItem[] {
  return requireAdminMenuByKey(menu, key).children ?? [];
}
