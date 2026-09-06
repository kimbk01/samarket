/**
 * ARO-OPS-UX-002-B7 — Menu / Frequency Final IA contract (static).
 * Ownership · order · duplicates · roots only. No page rewrite.
 */
import { describe, expect, it } from "vitest";
import { adminMenu, collectAdminMenuPathEntries } from "@/components/admin/admin-menu";
import { findAdminMenuByKey } from "@/lib/admin/find-admin-menu-item";
import {
  listAdminWorkspaces,
  resolveActiveWorkspace,
  resolveAdminBreadcrumb,
  resolveWorkspaceRootPath,
} from "@/lib/admin/admin-workspace-routing";
import { CUT_J_WORKSPACE_ORDER } from "@/lib/admin/admin-real-operation-cut-j-ia-separation-hard-lock";

describe("ARO-OPS-UX-002-B7 menu / frequency final IA", () => {
  it("B7-01/02 keeps exactly 10 top-level workspaces in operational order", () => {
    expect(adminMenu.map((w) => w.key)).toEqual([...CUT_J_WORKSPACE_ORDER]);
    expect(findAdminMenuByKey(adminMenu, "growth")).toBeUndefined();
    expect(findAdminMenuByKey(adminMenu, "common")).toBeUndefined();
  });

  it("B7-03/14/16/18 roots are Dashboard / Control Planes", () => {
    expect(resolveWorkspaceRootPath(findAdminMenuByKey(adminMenu, "dashboard")!)).toBe("/admin");
    expect(resolveWorkspaceRootPath(findAdminMenuByKey(adminMenu, "delivery")!)).toBe(
      "/admin/delivery"
    );
    expect(resolveWorkspaceRootPath(findAdminMenuByKey(adminMenu, "trade")!)).toBe("/admin/trade");
    expect(resolveWorkspaceRootPath(findAdminMenuByKey(adminMenu, "community")!)).toBe(
      "/admin/community"
    );
    expect(resolveWorkspaceRootPath(findAdminMenuByKey(adminMenu, "messenger")!)).toBe(
      "/admin/messenger"
    );
    expect(resolveWorkspaceRootPath(findAdminMenuByKey(adminMenu, "finance")!)).toBe(
      "/admin/finance"
    );
    expect(resolveWorkspaceRootPath(findAdminMenuByKey(adminMenu, "ads")!)).toBe(
      "/admin/delivery-ads"
    );
    expect(resolveWorkspaceRootPath(findAdminMenuByKey(adminMenu, "support")!)).toBe(
      "/admin/support"
    );
    expect(resolveWorkspaceRootPath(findAdminMenuByKey(adminMenu, "notifications")!)).toBe(
      "/admin/notifications"
    );
  });

  it("B7-05 delivery daily ops precede config/archive sections", () => {
    const top = (findAdminMenuByKey(adminMenu, "delivery")?.children ?? []).map((c) => c.key);
    expect(top.indexOf("delivery-section-operations")).toBeLessThan(
      top.indexOf("delivery-section-policies")
    );
    expect(top.indexOf("delivery-section-operations")).toBeLessThan(
      top.indexOf("delivery-section-settings")
    );
    const ops = (findAdminMenuByKey(adminMenu, "delivery-section-operations")?.children ?? []).map(
      (c) => c.key
    );
    expect(ops[0]).toBe("delivery-orders");
    expect(ops.indexOf("stores-commerce")).toBeLessThan(ops.indexOf("stores-home-shelves"));
  });

  it("B7-06/08/09 no path duplicates; legacy/stub not primary peers of control planes", () => {
    const entries = collectAdminMenuPathEntries(adminMenu);
    const counts = new Map<string, string[]>();
    for (const e of entries) {
      const list = counts.get(e.path) ?? [];
      list.push(e.key);
      counts.set(e.path, list);
    }
    expect([...counts.entries()].filter(([, keys]) => keys.length > 1)).toEqual([]);

    expect(findAdminMenuByKey(adminMenu, "support-legacy")).toBeUndefined();
    expect(findAdminMenuByKey(adminMenu, "cp-store-inquiry")).toBeUndefined();
    expect(findAdminMenuByKey(adminMenu, "ads-delivery-ops")).toBeUndefined();

    const adsKids = (findAdminMenuByKey(adminMenu, "ads")?.children ?? []).map((c) => c.key);
    expect(adsKids[0]).toBe("delivery-ads-control");
    expect(adsKids.at(-1)).toBe("ads-legacy");
    expect(findAdminMenuByKey(adminMenu, "ads-paid")?.path).toBe("/admin/promoted-items");
    expect(adsKids).not.toContain("ads-paid");
  });

  it("B7-10..13 domain ownership preserved", () => {
    expect(resolveActiveWorkspace("/admin/stores/orders", "master").id).toBe("delivery");
    expect(resolveActiveWorkspace("/admin/posts-management", "master").id).toBe("trade");
    expect(resolveActiveWorkspace("/admin/community/reports", "master").id).toBe("community");
    expect(resolveActiveWorkspace("/admin/chats/general", "master").id).toBe("messenger");
    expect(resolveActiveWorkspace("/admin/chats/group", "master").id).toBe("messenger");
    expect(resolveActiveWorkspace("/admin/chats/trade?from=messenger", "master").id).toBe(
      "messenger"
    );
    expect(resolveActiveWorkspace("/admin/order-chats?from=messenger", "master").id).toBe(
      "messenger"
    );
  });

  it("B7-15 B3 statement remains contextual finance ownership, not sidebar leaf", () => {
    const paths = collectAdminMenuPathEntries(adminMenu).map((e) => e.path);
    expect(paths.some((p) => p.includes("view=statement"))).toBe(false);
    expect(resolveActiveWorkspace("/admin/finance?storeId=x&view=statement", "master").id).toBe(
      "finance"
    );
  });

  it("B7-17/20 ads + notifications semantics", () => {
    expect(findAdminMenuByKey(adminMenu, "ads-feed-applications")?.path).toBe(
      "/admin/ad-applications?domain=feed"
    );
    expect(findAdminMenuByKey(adminMenu, "ads-placement-map")?.path).toBe(
      "/admin/delivery-ads/inventory#placement-map"
    );
    expect(findAdminMenuByKey(adminMenu, "ads-platform-popup")?.path).toBe("/admin/platform-popup");
    expect(resolveActiveWorkspace("/admin/settings/notifications", "master").id).toBe(
      "notifications"
    );
    expect(findAdminMenuByKey(adminMenu, "settings-notifications")?.path).toBe(
      "/admin/settings/notifications"
    );
  });

  it("B7-19 Support ≠ Messenger; B7-21 Reset under system", () => {
    expect(resolveActiveWorkspace("/admin/support", "master").id).toBe("support");
    expect(resolveActiveWorkspace("/admin/chats/messenger", "master").id).toBe("messenger");
    expect(findAdminMenuByKey(adminMenu, "system-prelaunch-reset")?.path).toBe(
      "/admin/prelaunch-reset"
    );
    expect(resolveActiveWorkspace("/admin/prelaunch-reset", "master").id).toBe("system");
  });

  it("B7-24/25 breadcrumb ownership tracks workspace", () => {
    const finance = listAdminWorkspaces("master").find((w) => w.id === "finance")!;
    const crumbs = resolveAdminBreadcrumb("/admin/finance", finance);
    expect(crumbs[0]?.key).toBe("finance");
    expect(crumbs.some((c) => c.key === "store-finance-admin")).toBe(true);

    const ads = listAdminWorkspaces("master").find((w) => w.id === "ads")!;
    const adsCrumbs = resolveAdminBreadcrumb("/admin/delivery-ads", ads);
    expect(adsCrumbs[0]?.key).toBe("ads");
    expect(adsCrumbs.some((c) => c.key === "delivery-ads-control")).toBe(true);
  });

  it("B7-26 deeplink query/hash preserved on canonical leaves", () => {
    expect(findAdminMenuByKey(adminMenu, "ads-applications")?.path).toBe(
      "/admin/ad-applications?domain=trade"
    );
    expect(findAdminMenuByKey(adminMenu, "ads-placement-map")?.path).toContain("#placement-map");
    expect(findAdminMenuByKey(adminMenu, "jobs-management")?.path).toBe(
      "/admin/posts-management?tab=jobs"
    );
  });
});
