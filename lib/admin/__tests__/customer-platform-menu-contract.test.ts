import { describe, expect, it } from "vitest";
import { adminMenu } from "@/components/admin/admin-menu";
import {
  findAdminMenuByKey,
  requireAdminMenuByKey,
  topLevelChildrenByKey,
} from "@/lib/admin/find-admin-menu-item";

describe("customer-platform menu IA", () => {
  it("nests Customer Platform under system workspace", () => {
    expect(adminMenu.some((w) => w.key === "customer-platform")).toBe(false);
    const system = requireAdminMenuByKey(adminMenu, "system");
    expect(system.children?.some((c) => c.key === "customer-platform")).toBe(true);
    const cp = requireAdminMenuByKey(adminMenu, "customer-platform");
    expect(cp.path).toBeUndefined();
    expect(cp.children?.some((c) => c.key === "cp-dashboard")).toBe(true);
    expect(cp.children?.some((c) => c.key === "cp-support")).toBe(true);
    expect(cp.children?.some((c) => c.key === "cp-member-assets")).toBe(true);
    expect(cp.children?.some((c) => c.key === "cp-notification-engine")).toBe(true);
  });

  it("A2-2: Support Center SSOT + archive; store_inquiries KEEP; legacy Care/platform off menu", () => {
    const support = requireAdminMenuByKey(adminMenu, "cp-support");
    const paths = (support.children ?? []).map((c) => c.path);
    expect(paths).toContain("/admin/support");
    expect(paths).toContain("/admin/support/archive");
    expect(paths).toContain("/admin/store-inquiries");
    expect(paths).not.toContain("/admin/member-notes?kind=inquiry");
    expect(paths).not.toContain("/admin/member-notes?kind=inbox");
    expect(paths).not.toContain("/admin/platform-inquiries");
  });

  it("keeps notice and engine under CP, not community", () => {
    const communityKids = topLevelChildrenByKey(adminMenu, "community");
    expect(communityKids.some((c) => c.key === "community-notices")).toBe(false);
    expect(communityKids.some((c) => c.key === "dibay-notification-campaigns")).toBe(false);
    expect(findAdminMenuByKey(adminMenu, "cp-notice")?.path).toBe("/admin/app/notices");
    expect(findAdminMenuByKey(adminMenu, "cp-notification-engine")?.path).toBe(
      "/admin/notifications"
    );
  });

  it("keeps member points under CP member assets only (not Common workspace leaves)", () => {
    const common = requireAdminMenuByKey(adminMenu, "common");
    const commonPaths = (common.children ?? []).map((c) => c.path);
    expect(commonPaths).not.toContain("/admin/point-charges");
    expect(findAdminMenuByKey(adminMenu, "cp-member-assets")).toBeTruthy();
    expect(findAdminMenuByKey(adminMenu, "points-charge")?.path).toBe("/admin/point-charges");
  });

  it("does not keep CS ops under delivery top-level children", () => {
    const deliveryKids = topLevelChildrenByKey(adminMenu, "delivery");
    expect(deliveryKids.some((c) => (c.path ?? "").includes("member-notes"))).toBe(false);
    expect(deliveryKids.some((c) => (c.path ?? "").includes("platform-inquiries"))).toBe(false);
  });
});
