import { describe, expect, it } from "vitest";
import { adminMenu } from "@/components/admin/admin-menu";
import {
  findAdminMenuByKey,
  requireAdminMenuByKey,
  topLevelChildrenByKey,
} from "@/lib/admin/find-admin-menu-item";

describe("customer-platform menu IA (CUT J)", () => {
  it("keeps Customer Platform under system workspace (slim hub)", () => {
    expect(adminMenu.some((w) => w.key === "customer-platform")).toBe(false);
    const system = requireAdminMenuByKey(adminMenu, "system");
    expect(system.children?.some((c) => c.key === "customer-platform")).toBe(true);
    const cp = requireAdminMenuByKey(adminMenu, "customer-platform");
    expect(cp.path).toBeUndefined();
    expect(cp.children?.some((c) => c.key === "cp-dashboard")).toBe(true);
    expect(cp.children?.some((c) => c.key === "cp-content")).toBe(true);
    // Extracted to common workspaces
    expect(cp.children?.some((c) => c.key === "cp-support")).toBe(false);
    expect(cp.children?.some((c) => c.key === "cp-member-assets")).toBe(false);
    expect(cp.children?.some((c) => c.key === "cp-store-assets")).toBe(false);
    expect(cp.children?.some((c) => c.key === "cp-notification-engine")).toBe(false);
  });

  it("A2-2 + J + B7: Support Center top-level; store_inquiries route KEEP but not primary", () => {
    expect(adminMenu.some((w) => w.key === "support")).toBe(true);
    expect(findAdminMenuByKey(adminMenu, "cp-support-center")?.path).toBe("/admin/support");
    expect(findAdminMenuByKey(adminMenu, "cp-support-archive")?.path).toBe(
      "/admin/support/archive"
    );
    // B7: legacy leaf removed from primary nav (route file may remain).
    expect(findAdminMenuByKey(adminMenu, "cp-store-inquiry")).toBeUndefined();
    const supportPaths = (findAdminMenuByKey(adminMenu, "support")?.children ?? [])
      .flatMap(function walk(n): string[] {
        const own = n.path ? [n.path] : [];
        return [...own, ...(n.children ?? []).flatMap(walk)];
      });
    expect(supportPaths).not.toContain("/admin/store-inquiries");
    expect(supportPaths).not.toContain("/admin/member-notes?kind=inquiry");
    expect(supportPaths).not.toContain("/admin/platform-inquiries");
  });

  it("keeps notice under CP content; notification engine under notifications workspace", () => {
    const communityKids = topLevelChildrenByKey(adminMenu, "community");
    expect(communityKids.some((c) => c.key === "community-notices")).toBe(false);
    expect(findAdminMenuByKey(adminMenu, "cp-notice")?.path).toBe("/admin/app/notices");
    expect(findAdminMenuByKey(adminMenu, "cp-notification-engine")?.path).toBe(
      "/admin/notifications"
    );
    expect(adminMenu.some((w) => w.key === "notifications")).toBe(true);
  });

  it("member points live under finance workspace (not dissolved common)", () => {
    expect(findAdminMenuByKey(adminMenu, "common")).toBeUndefined();
    expect(findAdminMenuByKey(adminMenu, "finance-member-point")).toBeTruthy();
    expect(findAdminMenuByKey(adminMenu, "points-charge")?.path).toBe("/admin/point-charges");
    expect(adminMenu.some((w) => w.key === "finance")).toBe(true);
  });

  it("does not keep CS ops under delivery top-level children", () => {
    const deliveryKids = topLevelChildrenByKey(adminMenu, "delivery");
    expect(deliveryKids.some((c) => (c.path ?? "").includes("member-notes"))).toBe(false);
    expect(deliveryKids.some((c) => (c.path ?? "").includes("platform-inquiries"))).toBe(false);
  });
});
