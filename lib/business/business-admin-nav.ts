import type { MessageKey } from "@/lib/i18n/messages";
import type { MyBusinessNavContext } from "@/lib/business/my-business-nav";
import {
  buildOwnerDrawerSectionsFromRegistry,
  resolveOwnerNavActiveIds,
  type OwnerNavGroupId,
  type OwnerNavSearchInput,
} from "@/lib/business/owner-nav-registry";
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
  groupId: OwnerNavGroupId;
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
  groupId: OwnerNavGroupId;
  title: string;
  items: BusinessAdminSidebarItem[];
};

type TranslateFn = (key: MessageKey) => string;

export function resolveBusinessAdminSidebar(
  defs: BusinessAdminSidebarSectionDef[],
  t: TranslateFn
): BusinessAdminSidebarSection[] {
  return defs.map((section) => ({
    groupId: section.groupId,
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

/**
 * 허브 메뉴·사이드바 공통 — 활성 행 판별 (4단계 IA-10 규칙 (1)).
 * `owner-nav-registry` 의 가장 긴 `activePrefixes`/`activeQuery` 일치 항목 + 조상에서만 파생.
 */
export function resolveBusinessAdminActiveNavIds(
  pathname: string,
  searchParams: OwnerNavSearchInput
): Set<BusinessAdminNavItemId> {
  return resolveOwnerNavActiveIds(pathname, searchParams);
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
