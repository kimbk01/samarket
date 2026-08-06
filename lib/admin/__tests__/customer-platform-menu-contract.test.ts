import { describe, expect, it } from "vitest";
import { adminMenu } from "@/components/admin/admin-menu";
import {
  findAdminMenuByKey,
  requireAdminMenuByKey,
  topLevelChildrenByKey,
} from "@/lib/admin/find-admin-menu-item";

describe("customer-platform menu IA", () => {
  it("exposes Customer Platform as a top-level group", () => {
    const cp = requireAdminMenuByKey(adminMenu, "customer-platform");
    expect(cp.path).toBe("/admin/customer-platform");
    expect(cp.children?.some((c) => c.key === "cp-dashboard")).toBe(true);
    expect(cp.children?.some((c) => c.key === "cp-support")).toBe(true);
    expect(cp.children?.some((c) => c.key === "cp-points")).toBe(true);
    expect(cp.children?.some((c) => c.key === "cp-notification-engine")).toBe(true);
  });

  it("keeps Member and Store support paths separate", () => {
    const support = requireAdminMenuByKey(adminMenu, "cp-support");
    const paths = (support.children ?? []).map((c) => c.path);
    expect(paths).toContain("/admin/member-notes?kind=inquiry");
    expect(paths).toContain("/admin/member-notes?kind=inbox");
    expect(paths).toContain("/admin/store-inquiries");
    expect(paths).toContain("/admin/platform-inquiries");
  });

  it("moves notice and engine out of community top-level children", () => {
    const communityKids = topLevelChildrenByKey(adminMenu, "community");
    expect(communityKids.some((c) => c.key === "community-notices")).toBe(false);
    expect(communityKids.some((c) => c.key === "dibay-notification-campaigns")).toBe(false);
    expect(findAdminMenuByKey(adminMenu, "cp-notice")?.path).toBe("/admin/app/notices");
    expect(findAdminMenuByKey(adminMenu, "cp-notification-engine")?.path).toBe(
      "/admin/notifications"
    );
  });

  it("does not keep member points under common", () => {
    const common = requireAdminMenuByKey(adminMenu, "common");
    expect((common.children ?? []).some((c) => c.key === "points")).toBe(false);
    expect(findAdminMenuByKey(adminMenu, "cp-points-member")).toBeTruthy();
    expect(findAdminMenuByKey(adminMenu, "points-charge")?.path).toBe("/admin/point-charges");
  });

  it("does not keep CS ops under delivery top-level children", () => {
    const deliveryKids = topLevelChildrenByKey(adminMenu, "delivery");
    expect(deliveryKids.some((c) => c.key === "member-notes-admin")).toBe(false);
    expect(deliveryKids.some((c) => c.key === "store-inquiries-admin")).toBe(false);
    expect(deliveryKids.some((c) => c.key === "store-points-admin")).toBe(false);
  });

  it("marks FAQ as pending without inventing a product route as done", () => {
    const faq = requireAdminMenuByKey(adminMenu, "cp-faq");
    expect(faq.pendingRoute).toBe(true);
    expect(faq.status).toBe("todo");
  });
});
