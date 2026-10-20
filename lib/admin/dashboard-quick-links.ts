/**
 * Dashboard quick links — projection from `adminMenu` SSOT only.
 * DO NOT define href / labelKey / roles here; only ordered menu keys + section.
 * LOCK: Slice 2A DEV_LINKS → menu SSOT consumer
 */

import {
  adminMenu,
  filterMenuByRole,
  type AdminMenuItem,
  type AdminMenuRole,
} from "@/components/admin/admin-menu";
import { resolveWorkspaceRootPath } from "@/lib/admin/admin-workspace-routing";
import { filterAdminMenuByAccess } from "@/lib/admin/access/admin-access-ui";
import {
  canAccessAdminRoute,
  type AdminRouteAccessActor,
} from "@/lib/admin/access/admin-route-access";
import type { MessageKey } from "@/lib/i18n/messages";

export type DashboardQuickLinkSection = "ops" | "manage" | "dev";

export type DashboardQuickLink = {
  menuKey: string;
  href: string;
  labelKey: MessageKey;
  /** Effective roles from nearest ancestor/item with `roles` (undefined = all roles). */
  roles: readonly AdminMenuRole[] | undefined;
  section: DashboardQuickLinkSection;
};

/**
 * Ordered menu keys for Dashboard cards — visibility/order only.
 * Path, label, and roles always resolve from SSOT.
 */
export const DASHBOARD_QUICK_LINK_MENU_KEYS = {
  ops: [
    "users",
    "delivery",
    "trade",
    "community",
    "messenger",
    "finance",
    "ads",
    "support",
    "notifications",
    "system",
  ],
  manage: ["manage-ops-board", "manage-docs", "manage-kb", "manage-maturity"],
  /** Former DEV_LINKS — system leaves. */
  dev: [
    "system-qa",
    "system-release-notes",
    "system-status",
    "system-backup",
  ],
} as const satisfies Record<DashboardQuickLinkSection, readonly string[]>;

const OPS_WORKSPACE_KEYS = new Set<string>(DASHBOARD_QUICK_LINK_MENU_KEYS.ops);

type Located = { item: AdminMenuItem; ancestors: AdminMenuItem[] };

function locateMenuItem(
  key: string,
  nodes: AdminMenuItem[] = adminMenu,
  ancestors: AdminMenuItem[] = []
): Located | null {
  for (const node of nodes) {
    if (node.key === key) return { item: node, ancestors };
    if (node.children?.length) {
      const hit = locateMenuItem(key, node.children, [...ancestors, node]);
      if (hit) return hit;
    }
  }
  return null;
}

function effectiveRoles(
  item: AdminMenuItem,
  ancestors: AdminMenuItem[]
): readonly AdminMenuRole[] | undefined {
  for (let i = ancestors.length - 1; i >= 0; i--) {
    const roles = ancestors[i]?.roles;
    if (roles?.length) return roles;
  }
  if (item.roles?.length) return item.roles;
  return undefined;
}

function resolveQuickLinkHref(item: AdminMenuItem, menuKey: string): string {
  if (OPS_WORKSPACE_KEYS.has(menuKey)) {
    return resolveWorkspaceRootPath(item);
  }
  if (!item.path) {
    throw new Error(`Dashboard quick link menu key "${menuKey}" has no canonical path`);
  }
  return item.path;
}

function isKeyVisibleInFilteredTree(key: string, filtered: AdminMenuItem[]): boolean {
  return locateMenuItem(key, filtered) != null;
}

function projectSection(
  section: DashboardQuickLinkSection,
  filtered: AdminMenuItem[],
  actor: AdminRouteAccessActor | null
): DashboardQuickLink[] {
  const out: DashboardQuickLink[] = [];
  for (const menuKey of DASHBOARD_QUICK_LINK_MENU_KEYS[section]) {
    if (!isKeyVisibleInFilteredTree(menuKey, filtered)) continue;
    const located = locateMenuItem(menuKey);
    if (!located) {
      throw new Error(`Dashboard quick link key missing from menu SSOT: ${menuKey}`);
    }
    const { item, ancestors } = located;
    const labelKey = item.titleKey;
    if (!labelKey) {
      throw new Error(`Dashboard quick link missing titleKey: ${menuKey}`);
    }
    // 접근표 필터가 걸린 경우 워크스페이스 바로가기는 "열 수 있는" 첫 leaf 로 간다.
    const hrefSource = actor ? (locateMenuItem(menuKey, filtered)?.item ?? item) : item;
    const href = resolveQuickLinkHref(hrefSource, menuKey);
    if (actor && !canAccessAdminRoute(href, actor)) continue;
    out.push({
      menuKey,
      href,
      labelKey,
      roles: effectiveRoles(item, ancestors),
      section,
    });
  }
  return out;
}

/**
 * `actor` (`/api/admin/me` 기반) 가 있으면 사이드바와 같은 접근표 필터를 적용해
 * 거부될 화면을 가리키는 바로가기를 뺀다 (설계 v4 §4-3). 없으면 역할 필터만 (기존 동작).
 */
export function projectDashboardQuickLinks(
  role: AdminMenuRole,
  actor: AdminRouteAccessActor | null = null
): {
  ops: DashboardQuickLink[];
  manage: DashboardQuickLink[];
  dev: DashboardQuickLink[];
} {
  const roleFiltered = filterMenuByRole(adminMenu, role);
  const filtered = actor ? filterAdminMenuByAccess(roleFiltered, actor) : roleFiltered;
  return {
    ops: projectSection("ops", filtered, actor),
    manage: projectSection("manage", filtered, actor),
    dev: projectSection("dev", filtered, actor),
  };
}

/** Flat projection for contract tests / adapters. */
export function listDashboardQuickLinks(
  role: AdminMenuRole,
  actor: AdminRouteAccessActor | null = null
): DashboardQuickLink[] {
  const sections = projectDashboardQuickLinks(role, actor);
  return [...sections.ops, ...sections.manage, ...sections.dev];
}

/** Map UI AdminRole (operator|manager|master) → menu filter role. */
export function adminUiRoleToMenuRole(
  uiRole: "operator" | "manager" | "master"
): AdminMenuRole {
  if (uiRole === "manager") return "admin";
  return uiRole;
}
