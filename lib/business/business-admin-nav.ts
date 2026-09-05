import type { MessageKey } from "@/lib/i18n/messages";
import type { MyBusinessNavContext } from "@/lib/business/my-business-nav";
import { buildOwnerDrawerSectionsFromRegistry } from "@/lib/business/owner-nav-registry";
import type { BusinessAdminNavItemId } from "@/lib/business/business-admin-nav-ids";

export type { BusinessAdminNavItemId };

export type BusinessAdminSidebarItemDef = {
  id: BusinessAdminNavItemId;
  labelKey: MessageKey;
  href: string;
  badge?: number;
  disabled?: boolean;
  hint?: string;
  descriptionKey?: MessageKey;
};

export type BusinessAdminSidebarSectionDef = {
  titleKey: MessageKey;
  items: BusinessAdminSidebarItemDef[];
};

export type BusinessAdminSidebarItem = {
  id: BusinessAdminNavItemId;
  label: string;
  href: string;
  badge?: number;
  disabled?: boolean;
  hint?: string;
  description?: string;
};

export type BusinessAdminSidebarSection = {
  title: string;
  items: BusinessAdminSidebarItem[];
};

type TranslateFn = (key: MessageKey) => string;

export function resolveBusinessAdminSidebar(
  defs: BusinessAdminSidebarSectionDef[],
  t: TranslateFn
): BusinessAdminSidebarSection[] {
  return defs.map((section) => ({
    title: t(section.titleKey),
    items: section.items.map((item) => ({
      id: item.id,
      label: t(item.labelKey),
      href: item.href,
      badge: item.badge,
      disabled: item.disabled,
      hint: item.hint,
      description: item.descriptionKey ? t(item.descriptionKey) : undefined,
    })),
  }));
}

/** 허브 메뉴·사이드바 공통 — 활성 행 판별 */
export function isBusinessAdminNavHrefActive(
  href: string,
  pathname: string,
  searchParams: URLSearchParams,
): boolean {
  const [path, rawQ = ""] = href.split("?");
  const norm = (v: string) => v.replace(/\/+$/, "") || "/";
  const targetPath = norm(path);
  const currentPath = norm(pathname);

  const isHubPath = (p: string) =>
    p === "/stores/owner" || p === "/my/business" || p === "/mypage/business";
  const pathsMatch =
    targetPath === currentPath || (isHubPath(targetPath) && isHubPath(currentPath));

  if (!pathsMatch) return false;

  const tq = new URLSearchParams(rawQ);
  const tSid = tq.get("storeId");
  if (tSid) {
    return searchParams.get("storeId") === tSid;
  }
  return true;
}

/**
 * 매장 어드민 드로어/사이드바 — `OwnerNavRegistry` 단일 권한에서 파생.
 * `ops_review` 와 `delivery_ops` 중복은 레지스트리에서 delivery_ops 하나로 붕괴.
 */
export function buildBusinessAdminSidebar(ctx: MyBusinessNavContext): BusinessAdminSidebarSectionDef[] {
  return buildOwnerDrawerSectionsFromRegistry(ctx).map((s) => ({
    ...s,
    items: s.items.filter((i) => !i.disabled),
  }));
}
