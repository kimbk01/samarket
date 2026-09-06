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

function findWorkspaceItem(workspaceKey: string, role: "master" | "operator" | "admin" | "viewer") {
  return listAdminWorkspaces(role).find((w) => w.id === workspaceKey)?.item;
}

describe("admin-workspace-routing (CUT J)", () => {
  it("lists CUT J workspaces for master", () => {
    const ws = listAdminWorkspaces("master");
    expect(ws.map((w) => w.id)).toEqual([
      "dashboard",
      "delivery",
      "trade",
      "community",
      "messenger",
      "finance",
      "ads",
      "support",
      "notifications",
      "system",
    ]);
  });

  it("keeps system workspace for operator while filtering role-gated nested leaves", () => {
    const master = listAdminWorkspaces("master").map((w) => w.id);
    const operator = listAdminWorkspaces("operator").map((w) => w.id);
    expect(master).toContain("system");
    expect(operator).toContain("system");
    expect(findWorkspaceItem("system", "operator")?.children?.some((c) => c.key === "platform-ops")).toBe(
      false
    );
  });

  it("resolves active workspace from pathname and matchPaths", () => {
    expect(resolveActiveWorkspace("/admin", "master").id).toBe("dashboard");
    expect(resolveActiveWorkspace("/admin/customer-platform", "master").id).toBe("system");
    expect(resolveActiveWorkspace("/admin/users", "master").id).toBe("system");
    expect(resolveActiveWorkspace("/admin/reports", "master").id).toBe("system");
    expect(resolveActiveWorkspace("/admin/finance", "master").id).toBe("finance");
    expect(resolveActiveWorkspace("/admin/point-charges", "master").id).toBe("finance");
    expect(resolveActiveWorkspace("/admin/delivery-ads", "master").id).toBe("ads");
    expect(resolveActiveWorkspace("/admin/feed-ads", "master").id).toBe("ads");
    expect(resolveActiveWorkspace("/admin/platform-popup", "master").id).toBe("ads");
    expect(resolveActiveWorkspace("/admin/support", "master").id).toBe("support");
    expect(resolveActiveWorkspace("/admin/notifications", "master").id).toBe("notifications");
    expect(resolveActiveWorkspace("/admin/reports?domain=trade", "master").id).toBe("trade");
    expect(
      resolveActiveWorkspace("/admin/reports?domain=trade&target_type=product", "master").id
    ).toBe("trade");
    expect(resolveActiveWorkspace("/admin/trade", "master").id).toBe("trade");
    expect(resolveActiveWorkspace("/admin/community/posts", "master").id).toBe("community");
    expect(resolveActiveWorkspace("/admin/philife/sections", "master").id).toBe("community");
    expect(resolveActiveWorkspace("/admin/stores/orders", "master").id).toBe("delivery");
    expect(resolveActiveWorkspace("/admin/stores-home-shelves", "master").id).toBe("delivery");
    expect(resolveActiveWorkspace("/admin/stores-category-policy", "master").id).toBe("delivery");
    expect(resolveActiveWorkspace("/admin/chats/messenger", "master").id).toBe("messenger");
    expect(resolveActiveWorkspace("/admin/promoted-items", "master").id).toBe("ads");
    expect(resolveActiveWorkspace("/admin/settings", "master").id).toBe("system");
    expect(resolveActiveWorkspace("/admin/prelaunch-reset", "master").id).toBe("system");
  });

  it("does not treat every /admin/* as HOME", () => {
    expect(adminPathMatches("/admin/users", "/admin")).toBe(false);
    expect(adminPathMatches("/admin", "/admin")).toBe(true);
  });

  it("computes workspace roots from SSOT leaves", () => {
    const finance = adminMenu.find((w) => w.key === "finance")!;
    // ARO-OPS-UX-002-B7: B4 Finance Control Plane is workspace root first leaf.
    expect(resolveWorkspaceRootPath(finance)).toBe("/admin/finance");
    const ads = adminMenu.find((w) => w.key === "ads")!;
    expect(resolveWorkspaceRootPath(ads)).toBe("/admin/advertising");
    const support = adminMenu.find((w) => w.key === "support")!;
    expect(resolveWorkspaceRootPath(support)).toBe("/admin/support");
    const system = adminMenu.find((w) => w.key === "system")!;
    expect(resolveWorkspaceRootPath(system)).toBe("/admin/customer-platform");
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
