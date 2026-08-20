import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";
import { adminMenu, filterMenuByRole } from "@/components/admin/admin-menu";
import {
  DASHBOARD_QUICK_LINK_MENU_KEYS,
  listDashboardQuickLinks,
  projectDashboardQuickLinks,
} from "@/lib/admin/dashboard-quick-links";
import { findAdminMenuByKey } from "@/lib/admin/find-admin-menu-item";
import { resolveWorkspaceRootPath } from "@/lib/admin/admin-workspace-routing";

const OPS_KEYS = new Set<string>(DASHBOARD_QUICK_LINK_MENU_KEYS.ops);

function expectedHref(menuKey: string): string {
  const item = findAdminMenuByKey(adminMenu, menuKey);
  expect(item).toBeTruthy();
  if (OPS_KEYS.has(menuKey)) return resolveWorkspaceRootPath(item!);
  expect(item!.path).toBeTruthy();
  return item!.path!;
}

describe("dashboard quick links ← menu SSOT (Slice 2A)", () => {
  it("master: href/labelKey/roles match menu SSOT; no unknown/duplicate paths", () => {
    const links = listDashboardQuickLinks("master");
    expect(links.length).toBe(
      DASHBOARD_QUICK_LINK_MENU_KEYS.ops.length +
        DASHBOARD_QUICK_LINK_MENU_KEYS.manage.length +
        DASHBOARD_QUICK_LINK_MENU_KEYS.dev.length
    );

    const hrefs = links.map((l) => l.href);
    expect(new Set(hrefs).size).toBe(hrefs.length);
    expect(hrefs.some((h) => h === "/admin/operations")).toBe(false);

    for (const link of links) {
      const item = findAdminMenuByKey(adminMenu, link.menuKey);
      expect(item, link.menuKey).toBeTruthy();
      expect(link.href).toBe(expectedHref(link.menuKey));
      expect(link.labelKey).toBe(item!.titleKey);
      if (link.section === "dev") {
        expect(link.roles).toEqual(["master"]);
      }
      if (link.section === "manage") {
        expect(link.roles).toEqual(["admin", "master"]);
      }
    }
  });

  it("operator: manage+dev empty; ops still projected from SSOT", () => {
    const sections = projectDashboardQuickLinks("operator");
    expect(sections.manage).toEqual([]);
    expect(sections.dev).toEqual([]);
    expect(sections.ops.length).toBe(DASHBOARD_QUICK_LINK_MENU_KEYS.ops.length);
    expect(sections.ops.every((l) => l.href.startsWith("/admin"))).toBe(true);
  });

  it("admin (manager UI): manage visible, dev hidden", () => {
    const sections = projectDashboardQuickLinks("admin");
    expect(sections.manage.map((l) => l.menuKey)).toEqual([
      ...DASHBOARD_QUICK_LINK_MENU_KEYS.manage,
    ]);
    expect(sections.dev).toEqual([]);
  });

  it("dev section matches former DEV_LINKS paths via SSOT leaves", () => {
    const dev = projectDashboardQuickLinks("master").dev;
    expect(dev.map((l) => l.href)).toEqual([
      "/admin/qa-board",
      "/admin/release-notes",
      "/admin/system",
      "/admin/backup",
    ]);
    expect(dev.map((l) => l.labelKey)).toEqual([
      "admin_menu_dev_qa",
      "admin_menu_dev_release_notes",
      "admin_menu_dev_system_status",
      "admin_menu_dev_backup",
    ]);
  });

  it("delivery ops quick link uses workspace root (/admin/stores), not a hand-picked child", () => {
    const delivery = projectDashboardQuickLinks("master").ops.find(
      (l) => l.menuKey === "delivery"
    );
    expect(delivery?.href).toBe("/admin/stores");
    expect(delivery?.labelKey).toBe("admin_menu_delivery");
  });

  it("menu removal would drop dashboard link (keys must exist in SSOT)", () => {
    for (const section of Object.values(DASHBOARD_QUICK_LINK_MENU_KEYS)) {
      for (const key of section) {
        expect(findAdminMenuByKey(adminMenu, key)?.key).toBe(key);
      }
    }
  });

  it("sidebar filter and dashboard projection share the same role gate for system leaves", () => {
    const filteredMaster = filterMenuByRole(adminMenu, "master");
    const filteredOperator = filterMenuByRole(adminMenu, "operator");
    expect(findAdminMenuByKey(filteredMaster, "system-qa")).toBeTruthy();
    expect(findAdminMenuByKey(filteredOperator, "system-qa")).toBeUndefined();
    expect(projectDashboardQuickLinks("master").dev.some((l) => l.menuKey === "system-qa")).toBe(
      true
    );
    expect(projectDashboardQuickLinks("operator").dev.some((l) => l.menuKey === "system-qa")).toBe(
      false
    );
  });

  it("source: DEV_LINKS constant removed; dashboard nav does not hardcode /admin/... hrefs", () => {
    const dashboardFile = readFileSync(
      resolve(process.cwd(), "components/admin/dashboard/DashboardQuickLinksBySection.tsx"),
      "utf8"
    );
    expect(dashboardFile).not.toMatch(/\bDEV_LINKS\b/);
    expect(dashboardFile).not.toMatch(/href:\s*["']\/admin\//);
    expect(dashboardFile).not.toMatch(/["']\/admin\/[a-z0-9#/?_-]+["']/);
  });

  it("adapter priority exports stay SSOT-derived (no second href authority)", async () => {
    const mod = await import("@/lib/admin-menu-config");
    const projected = projectDashboardQuickLinks("master");
    expect(mod.OPS_QUICK_LINKS_PRIORITY.map((l) => l.href)).toEqual(
      projected.ops.map((l) => l.href)
    );
    expect(mod.MANAGE_QUICK_LINKS_PRIORITY.map((l) => l.href)).toEqual(
      projected.manage.map((l) => l.href)
    );
    expect(mod.DEV_QUICK_LINKS_PRIORITY.map((l) => l.href)).toEqual(
      projected.dev.map((l) => l.href)
    );
  });
});
