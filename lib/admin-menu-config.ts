import { adminMenu, type AdminMenuItem as SidebarAdminMenuItem } from "@/components/admin/admin-menu";
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

function getTopMenu(key: string): SidebarAdminMenuItem {
  const item = adminMenu.find((row) => row.key === key);
  if (!item) {
    throw new Error(`Missing admin menu key: ${key}`);
  }
  return item;
}

function topChildren(key: string): AdminMenuItem[] {
  return (getTopMenu(key).children ?? []).map(cloneMenuItem);
}

function flattenMenuLinks(items: AdminMenuItem[]): { label: string; href: string }[] {
  const out: { label: string; href: string }[] = [];
  for (const item of items) {
    if (item.href) out.push({ label: item.label, href: item.href });
    if (item.children?.length) out.push(...flattenMenuLinks(item.children));
  }
  return out;
}

const OPS_ITEMS = topChildren("operations");
const ADS_ITEMS = topChildren("ads");
const POINT_ITEMS = topChildren("points");
const SETTINGS_ITEMS = topChildren("settings");
const MANAGE_TOP = getTopMenu("manage");
const SYSTEM_TOP = getTopMenu("system");

export const MANAGE_MENU_GROUPS: OpsMenuGroup[] = (MANAGE_TOP.children ?? []).map((group) => ({
  groupLabel: group.title,
  items: flattenMenuLinks((group.children ?? []).map(cloneMenuItem)),
}));

const MANAGE_ITEMS: AdminMenuItem[] = MANAGE_MENU_GROUPS.flatMap((group) =>
  group.items.map((item) => ({ label: item.label, href: item.href }))
);

const DEV_ITEMS = (SYSTEM_TOP.children ?? []).map(cloneMenuItem);

export const OPS_MENU_GROUPS: OpsMenuGroup[] = [
  { groupLabel: getTopMenu("operations").title, items: flattenMenuLinks(OPS_ITEMS) },
];

/** 대시보드 바로가기 — 라벨은 `t(labelKey)` 로 표시 */
export const OPS_QUICK_LINKS_PRIORITY: readonly { href: string; labelKey: MessageKey }[] = [
  { href: "/admin/operations", labelKey: "admin_quicklink_ops_hub" },
  { href: "/admin/reports", labelKey: "admin_quicklink_reports_ops" },
  { href: "/admin/products", labelKey: "admin_menu_trade_products" },
  { href: "/admin/users", labelKey: "admin_menu_users" },
  { href: "/admin/boards", labelKey: "admin_menu_boards" },
  { href: "/admin/point-charges", labelKey: "admin_menu_points_charge" },
  { href: "/admin/chats", labelKey: "admin_menu_chat" },
  { href: "/admin/ad-applications", labelKey: "admin_menu_ads_applications" },
  { href: "/admin/settings", labelKey: "admin_menu_settings_general" },
];

export const MANAGE_QUICK_LINKS_PRIORITY: readonly { href: string; labelKey: MessageKey }[] = [
  { href: "/admin/ops-board", labelKey: "admin_menu_manage_ops_board" },
  { href: "/admin/recommendation-reports", labelKey: "admin_menu_manage_reports" },
  { href: "/admin/recommendation-experiments", labelKey: "admin_menu_manage_ab" },
  { href: "/admin/ops-docs", labelKey: "admin_menu_manage_docs" },
  { href: "/admin/ops-knowledge", labelKey: "admin_menu_manage_kb" },
  { href: "/admin/ops-maturity", labelKey: "admin_menu_manage_maturity" },
];

export const ADMIN_MENU_SECTIONS: AdminMenuSection[] = [
  { id: "dashboard", label: getTopMenu("dashboard").title, requiredRole: "operator", items: [] },
  { id: "ops", label: getTopMenu("operations").title, requiredRole: "operator", items: OPS_ITEMS },
  { id: "ads", label: getTopMenu("ads").title, requiredRole: "operator", items: ADS_ITEMS },
  { id: "point", label: getTopMenu("points").title, requiredRole: "operator", items: POINT_ITEMS },
  { id: "settings", label: getTopMenu("settings").title, requiredRole: "operator", items: SETTINGS_ITEMS },
  { id: "manage", label: MANAGE_TOP.title, requiredRole: "manager", items: MANAGE_ITEMS },
  { id: "dev", label: SYSTEM_TOP.title, requiredRole: "master", items: DEV_ITEMS },
];
