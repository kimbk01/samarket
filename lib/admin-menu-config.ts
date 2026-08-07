/**
 * Compatibility adapter over `components/admin/admin-menu.ts` (SSOT).
 * DO NOT invent a second menu tree here — derive from adminMenu only.
 * LOCK: docs/admin/platform-admin-ia-lock.md
 */

import { adminMenu, type AdminMenuItem as SidebarAdminMenuItem } from "@/components/admin/admin-menu";
import {
  findAdminMenuByKey,
  requireAdminMenuByKey,
} from "@/lib/admin/find-admin-menu-item";
import type { MessageKey } from "@/lib/i18n/messages";

export type AdminRole = "operator" | "manager" | "master";

export type AdminSectionId =
  | "dashboard"
  | "ops"
  | "ads"
  | "point"
  | "settings"
  | "manage"
  | "dev";

export interface AdminMenuItem {
  label: string;
  href?: string;
  children?: AdminMenuItem[];
}

export interface AdminMenuSection {
  id: AdminSectionId;
  label: string;
  requiredRole: AdminRole;
  items: AdminMenuItem[];
}

export interface OpsMenuGroup {
  groupLabel: string;
  items: { label: string; href: string }[];
}

function cloneMenuItem(item: SidebarAdminMenuItem): AdminMenuItem {
  return {
    label: item.title,
    href: item.path,
    children: item.children?.map(cloneMenuItem),
  };
}

function menuChildrenAsConfigItems(key: string): AdminMenuItem[] {
  const node = findAdminMenuByKey(adminMenu, key);
  return (node?.children ?? []).map(cloneMenuItem);
}

function flattenMenuLinks(items: AdminMenuItem[]): { label: string; href: string }[] {
  const out: { label: string; href: string }[] = [];
  for (const item of items) {
    if (item.href) out.push({ label: item.label, href: item.href });
    if (item.children?.length) out.push(...flattenMenuLinks(item.children));
  }
  return out;
}

/** Ops workspaces — 구 community/trade/delivery/messenger + moderation */
const OPS_DOMAIN_KEYS = [
  "customer-platform",
  "members",
  "moderation",
  "trade",
  "community",
  "delivery",
  "messenger",
  "growth",
] as const;

const OPS_ITEMS: AdminMenuItem[] = OPS_DOMAIN_KEYS.flatMap((key) =>
  menuChildrenAsConfigItems(key)
);

const ADS_ITEMS = menuChildrenAsConfigItems("ads");
/** Member point ops live under Customer Platform (`cp-member-assets`). */
const POINT_ITEMS = menuChildrenAsConfigItems("cp-member-assets");
const APP_CONFIG_TOP = requireAdminMenuByKey(adminMenu, "app-config");
const SETTINGS_ITEMS = (APP_CONFIG_TOP.children ?? []).map(cloneMenuItem);
const MANAGE_TOP = requireAdminMenuByKey(adminMenu, "manage");
const SYSTEM_TOP = requireAdminMenuByKey(adminMenu, "system");

export const MANAGE_MENU_GROUPS: OpsMenuGroup[] = (MANAGE_TOP.children ?? []).map((group) => ({
  groupLabel: group.key,
  items: flattenMenuLinks((group.children ?? []).map(cloneMenuItem)),
}));

const MANAGE_ITEMS: AdminMenuItem[] = MANAGE_MENU_GROUPS.flatMap((group) =>
  group.items.map((item) => ({ label: item.label, href: item.href }))
);

const DEV_ITEMS = (SYSTEM_TOP.children ?? []).map(cloneMenuItem);

export const OPS_MENU_GROUPS: OpsMenuGroup[] = OPS_DOMAIN_KEYS.map((key) => {
  const node = requireAdminMenuByKey(adminMenu, key);
  return {
    groupLabel: key,
    items: flattenMenuLinks((node.children ?? []).map(cloneMenuItem)),
  };
});

/**
 * HOME 퀵링크 — workspace 진입만 (기능 전체 재나열·operations 허브 금지).
 * SSOT leaf path를 사용한다.
 */
export const OPS_QUICK_LINKS_PRIORITY: readonly { href: string; labelKey: MessageKey }[] = [
  { href: "/admin/customer-platform", labelKey: "admin_menu_customer_platform" },
  { href: "/admin/users", labelKey: "admin_menu_members" },
  { href: "/admin/reports", labelKey: "admin_menu_moderation" },
  { href: "/admin/trade", labelKey: "admin_menu_trade" },
  { href: "/admin/community", labelKey: "admin_menu_community" },
  { href: "/admin/stores/orders", labelKey: "admin_menu_delivery" },
  { href: "/admin/chats", labelKey: "admin_menu_messenger" },
  { href: "/admin/ad-applications", labelKey: "admin_menu_growth" },
  { href: "/admin/settings", labelKey: "admin_menu_app_config" },
];

export const MANAGE_QUICK_LINKS_PRIORITY: readonly { href: string; labelKey: MessageKey }[] = [
  { href: "/admin/ops-board", labelKey: "admin_menu_manage_ops_board" },
  { href: "/admin/ops-docs", labelKey: "admin_menu_manage_docs" },
  { href: "/admin/ops-knowledge", labelKey: "admin_menu_manage_kb" },
  { href: "/admin/ops-maturity", labelKey: "admin_menu_manage_maturity" },
];

const DASHBOARD_TOP = requireAdminMenuByKey(adminMenu, "dashboard");

export const ADMIN_MENU_SECTIONS: AdminMenuSection[] = [
  { id: "dashboard", label: DASHBOARD_TOP.title, requiredRole: "operator", items: [] },
  { id: "ops", label: "ops", requiredRole: "operator", items: OPS_ITEMS },
  { id: "ads", label: "ads", requiredRole: "operator", items: ADS_ITEMS },
  { id: "point", label: "points", requiredRole: "operator", items: POINT_ITEMS },
  { id: "settings", label: APP_CONFIG_TOP.title, requiredRole: "operator", items: SETTINGS_ITEMS },
  { id: "manage", label: MANAGE_TOP.key, requiredRole: "manager", items: MANAGE_ITEMS },
  { id: "dev", label: SYSTEM_TOP.key, requiredRole: "master", items: DEV_ITEMS },
];
