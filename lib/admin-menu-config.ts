import { adminMenu, type AdminMenuItem as SidebarAdminMenuItem } from "@/components/admin/admin-menu";

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

function lookupLabelByHref(href: string, fallback: string): string {
  const queue = [...adminMenu];
  while (queue.length > 0) {
    const item = queue.shift();
    if (!item) break;
    if (item.path === href) return item.title;
    if (item.children?.length) queue.push(...item.children);
  }
  return fallback;
}

function buildQuickLinks(hrefs: readonly string[], fallbackLabels: readonly string[]) {
  return hrefs.map((href, index) => ({
    href,
    label: lookupLabelByHref(href, fallbackLabels[index] ?? href),
  }));
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

export const OPS_QUICK_LINKS_PRIORITY = buildQuickLinks(
  [
    "/admin/operations",
    "/admin/reports",
    "/admin/products",
    "/admin/users",
    "/admin/boards",
    "/admin/point-charges",
    "/admin/chats",
    "/admin/ad-applications",
    "/admin/settings",
  ],
  ["운영 허브", "통합 신고·제재", "상품관리", "회원관리", "게시판관리", "포인트충전", "채팅관리", "광고신청 관리", "설정관리"]
);

export const MANAGE_QUICK_LINKS_PRIORITY = buildQuickLinks(
  [
    "/admin/ops-board",
    "/admin/recommendation-reports",
    "/admin/recommendation-experiments",
    "/admin/ops-docs",
    "/admin/ops-knowledge",
    "/admin/ops-maturity",
  ],
  ["운영보드", "추천보고서", "A/B실험", "운영문서", "지식베이스", "운영성숙도"]
);

export const ADMIN_MENU_SECTIONS: AdminMenuSection[] = [
  { id: "dashboard", label: getTopMenu("dashboard").title, requiredRole: "operator", items: [] },
  { id: "ops", label: getTopMenu("operations").title, requiredRole: "operator", items: OPS_ITEMS },
  { id: "ads", label: getTopMenu("ads").title, requiredRole: "operator", items: ADS_ITEMS },
  { id: "point", label: getTopMenu("points").title, requiredRole: "operator", items: POINT_ITEMS },
  { id: "settings", label: getTopMenu("settings").title, requiredRole: "operator", items: SETTINGS_ITEMS },
  { id: "manage", label: MANAGE_TOP.title, requiredRole: "manager", items: MANAGE_ITEMS },
  { id: "dev", label: SYSTEM_TOP.title, requiredRole: "master", items: DEV_ITEMS },
];
