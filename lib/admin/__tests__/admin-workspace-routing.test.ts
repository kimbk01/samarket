import { describe, expect, it } from "vitest";
import { adminMenu, collectAdminMenuPathEntries } from "@/components/admin/admin-menu";
import {
  adminPathMatches,
  collectWorkspaceMatchPaths,
  isPlatformAdminPathname,
  listAdminWorkspaces,
  resolveActiveWorkspace,
  resolveAdminBreadcrumb,
  resolveWorkspaceRootPath,
} from "@/lib/admin/admin-workspace-routing";

describe("admin-workspace-routing", () => {
  it("lists 11 workspaces for master", () => {
    const ws = listAdminWorkspaces("master");
    expect(ws.map((w) => w.id)).toEqual([
      "dashboard",
      "customer-platform",
      "members",
      "moderation",
      "trade",
      "community",
      "delivery",
      "messenger",
      "growth",
      "app-config",
      "platform-ops",
    ]);
  });

  it("hides platform-ops system-only leaves for operator but keeps workspace if manage filtered", () => {
    const master = listAdminWorkspaces("master").map((w) => w.id);
    const operator = listAdminWorkspaces("operator").map((w) => w.id);
    expect(master).toContain("platform-ops");
    // manage+system both role-gated — operator may still see empty platform-ops filtered away
    expect(operator.includes("platform-ops")).toBe(false);
  });

  it("resolves active workspace from pathname and matchPaths", () => {
    expect(resolveActiveWorkspace("/admin", "master").id).toBe("dashboard");
    expect(resolveActiveWorkspace("/admin/customer-platform", "master").id).toBe(
      "customer-platform"
    );
    expect(resolveActiveWorkspace("/admin/users", "master").id).toBe("members");
    expect(resolveActiveWorkspace("/admin/reports", "master").id).toBe("moderation");
    expect(resolveActiveWorkspace("/admin/trade", "master").id).toBe("trade");
    expect(resolveActiveWorkspace("/admin/community/posts", "master").id).toBe("community");
    expect(resolveActiveWorkspace("/admin/philife/sections", "master").id).toBe("community");
    expect(resolveActiveWorkspace("/admin/stores/orders", "master").id).toBe("delivery");
    expect(resolveActiveWorkspace("/admin/chats/messenger", "master").id).toBe("messenger");
    expect(resolveActiveWorkspace("/admin/promoted-items", "master").id).toBe("growth");
    expect(resolveActiveWorkspace("/admin/settings", "master").id).toBe("app-config");
    expect(resolveActiveWorkspace("/admin/system", "master").id).toBe("platform-ops");
  });

  it("does not treat every /admin/* as HOME", () => {
    expect(adminPathMatches("/admin/users", "/admin")).toBe(false);
    expect(adminPathMatches("/admin", "/admin")).toBe(true);
  });

  it("computes workspace roots from SSOT leaves", () => {
    const cp = adminMenu.find((w) => w.key === "customer-platform")!;
    expect(resolveWorkspaceRootPath(cp)).toBe("/admin/customer-platform");
    const members = adminMenu.find((w) => w.key === "members")!;
    expect(resolveWorkspaceRootPath(members)).toBe("/admin/users");
  });

  it("builds breadcrumb from workspace chain", () => {
    const ws = resolveActiveWorkspace("/admin/stores/orders/cancellations", "master");
    const crumbs = resolveAdminBreadcrumb("/admin/stores/orders/cancellations", ws);
    expect(crumbs[0]?.key).toBe("delivery");
    expect(crumbs.some((c) => c.key === "delivery-orders-cancel")).toBe(true);
  });

  it("keeps redirect-only paths out of menu leaf set while matching via matchPaths only when declared", () => {
    const leaves = new Set(collectAdminMenuPathEntries(adminMenu).map((e) => e.path));
    expect(leaves.has("/admin/delivery-orders")).toBe(false);
    expect(leaves.has("/admin/operations")).toBe(false);
    const delivery = adminMenu.find((w) => w.key === "delivery")!;
    const matches = collectWorkspaceMatchPaths(delivery);
    expect(matches).toContain("/admin/delivery-orders");
  });

  it("isolates owner routes from platform admin pathname guard", () => {
    expect(isPlatformAdminPathname("/admin")).toBe(true);
    expect(isPlatformAdminPathname("/admin/users")).toBe(true);
    expect(isPlatformAdminPathname("/stores/owner")).toBe(false);
    expect(isPlatformAdminPathname("/stores/owner/orders")).toBe(false);
  });
});
