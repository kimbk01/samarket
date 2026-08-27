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
    "common",
    "community",
    "trade",
    "delivery",
    "messenger",
    "system",
  ],
  manage: ["gift-tracking", "manage-ops-board", "manage-docs", "manage-kb", "manage-maturity"],
  /** Former DEV_LINKS — system leaves (audit lives under Common). */
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
  role: AdminMenuRole,
  filtered: AdminMenuItem[]
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
    out.push({
      menuKey,
      href: resolveQuickLinkHref(item, menuKey),
      labelKey,
      roles: effectiveRoles(item, ancestors),
      section,
    });
  }
  return out;
}

export function projectDashboardQuickLinks(role: AdminMenuRole): {
  ops: DashboardQuickLink[];
  manage: DashboardQuickLink[];
  dev: DashboardQuickLink[];
} {
  const filtered = filterMenuByRole(adminMenu, role);
  return {
    ops: projectSection("ops", role, filtered),
    manage: projectSection("manage", role, filtered),
    dev: projectSection("dev", role, filtered),
  };
}

/** Flat projection for contract tests / adapters. */
export function listDashboardQuickLinks(role: AdminMenuRole): DashboardQuickLink[] {
  const sections = projectDashboardQuickLinks(role);
  return [...sections.ops, ...sections.manage, ...sections.dev];
}

/** Map UI AdminRole (operator|manager|master) → menu filter role. */
export function adminUiRoleToMenuRole(
  uiRole: "operator" | "manager" | "master"
): AdminMenuRole {
  if (uiRole === "manager") return "admin";
  return uiRole;
}
