/**
 * CUT J — Domain / Common Operation IA navigation contract (J1–J34).
 */
import { describe, expect, it } from "vitest";
import { existsSync } from "node:fs";
import path from "node:path";
import {
  adminMenu,
  collectAdminMenuPathEntries,
} from "@/components/admin/admin-menu";
import { findAdminMenuByKey } from "@/lib/admin/find-admin-menu-item";
import { resolveActiveWorkspace } from "@/lib/admin/admin-workspace-routing";
import {
  assertAdminRealOperationCutJIaSeparationHardLock,
  CUT_I_CARRY_INTO_J,
  CUT_J_CONFIG_VS_OPERATION,
  CUT_J_LEGACY_PRIMARY_FORBIDDEN,
  CUT_J_NAV_SSOT,
  CUT_J_WORKSPACE_ORDER,
} from "@/lib/admin/admin-real-operation-cut-j-ia-separation-hard-lock";

const ROOT = path.resolve(__dirname, "../../..");

function workspaceOf(route: string) {
  return resolveActiveWorkspace(route, "master").id;
}

describe("CUT J IA separation hard lock", () => {
  it("anchor asserts", () => {
    expect(assertAdminRealOperationCutJIaSeparationHardLock()).toBe(true);
    expect(CUT_J_NAV_SSOT.menuTreeAuthority).toBe("components/admin/admin-menu.ts");
  });

  it("J1 /admin → dashboard (운영 / Action Center)", () => {
    expect(workspaceOf("/admin")).toBe("dashboard");
  });

  it("J2 HOME config → delivery", () => {
    expect(workspaceOf(CUT_J_CONFIG_VS_OPERATION.homeConfigRoute)).toBe("delivery");
  });

  it("J3 Category config → delivery", () => {
    expect(workspaceOf(CUT_J_CONFIG_VS_OPERATION.categoryConfigRoute)).toBe("delivery");
  });

  it("J4 Store/order management → delivery", () => {
    expect(workspaceOf("/admin/stores")).toBe("delivery");
    expect(workspaceOf("/admin/stores/orders")).toBe("delivery");
  });

  it("J5 Trade management → trade", () => {
    expect(workspaceOf("/admin/trade")).toBe("trade");
    expect(workspaceOf("/admin/posts-management")).toBe("trade");
  });

  it("J6 Community management → community", () => {
    expect(workspaceOf("/admin/community/posts")).toBe("community");
  });

  it("J7 Messenger admin surface → messenger", () => {
    expect(workspaceOf("/admin/chats/messenger")).toBe("messenger");
    expect(workspaceOf("/admin/chats/reported")).toBe("messenger");
  });

  it("J8 /admin/finance → finance", () => {
    expect(workspaceOf("/admin/finance")).toBe("finance");
  });

  it("J9 Point / Coin / Cash leaves → finance", () => {
    expect(workspaceOf("/admin/point-charges")).toBe("finance");
    expect(workspaceOf("/admin/store-point-ledger")).toBe("finance");
    expect(findAdminMenuByKey(adminMenu, "finance-member-point")).toBeTruthy();
    expect(findAdminMenuByKey(adminMenu, "finance-store-currency")).toBeTruthy();
  });

  it("J10 /admin/delivery-ads → ads", () => {
    expect(workspaceOf("/admin/delivery-ads")).toBe("ads");
  });

  it("J11 /admin/feed-ads → ads", () => {
    expect(workspaceOf("/admin/feed-ads")).toBe("ads");
  });

  it("J12 /admin/platform-popup → ads", () => {
    expect(workspaceOf("/admin/platform-popup")).toBe("ads");
  });

  it("J13 Placement Map → ads", () => {
    expect(workspaceOf("/admin/delivery-ads/inventory")).toBe("ads");
    expect(findAdminMenuByKey(adminMenu, "ads-placement-map")?.path).toBe(
      CUT_J_CONFIG_VS_OPERATION.placementMapRoute
    );
  });

  it("J14 /admin/support → support", () => {
    expect(workspaceOf("/admin/support")).toBe("support");
  });

  it("J15 notifications → notifications", () => {
    expect(workspaceOf("/admin/notifications")).toBe("notifications");
  });

  it("J16 /admin/prelaunch-reset → system", () => {
    expect(workspaceOf("/admin/prelaunch-reset")).toBe("system");
  });

  it("J17 legacy platform inquiry not primary", () => {
    const paths = collectAdminMenuPathEntries(adminMenu).map((e) => e.path);
    expect(paths).not.toContain(CUT_J_LEGACY_PRIMARY_FORBIDDEN.platformInquiriesPrimary);
  });

  it("J18 AST-002 store points charges not primary nav", () => {
    expect(
      findAdminMenuByKey(adminMenu, CUT_J_LEGACY_PRIMARY_FORBIDDEN.ast002StorePointChargesMenuKey)
    ).toBeUndefined();
  });

  it("J19 no duplicate canonical mutation page (one path = one leaf)", () => {
    const entries = collectAdminMenuPathEntries(adminMenu);
    const counts = new Map<string, string[]>();
    for (const e of entries) {
      const list = counts.get(e.path) ?? [];
      list.push(e.key);
      counts.set(e.path, list);
    }
    const dupes = [...counts.entries()].filter(([, keys]) => keys.length > 1);
    expect(dupes).toEqual([]);
  });

  it("J20 config vs operation boundary preserved", () => {
    expect(workspaceOf(CUT_J_CONFIG_VS_OPERATION.homeConfigRoute)).toBe(
      CUT_J_CONFIG_VS_OPERATION.homeConfigWorkspace
    );
    expect(workspaceOf(CUT_J_CONFIG_VS_OPERATION.deliveryAdsOpsRoute)).toBe(
      CUT_J_CONFIG_VS_OPERATION.deliveryAdsOpsWorkspace
    );
    expect(CUT_J_CONFIG_VS_OPERATION.placementMapIsConfigWriter).toBe(false);
    const deliveryOps = findAdminMenuByKey(adminMenu, "delivery-section-operations");
    const opsKeys = (deliveryOps?.children ?? []).map((c) => c.key);
    expect(opsKeys).not.toContain("delivery-ads-control");
    expect(opsKeys).not.toContain("store-ads-section");
  });

  it("J21–J34 operational findability primary paths", () => {
    const findability: Record<string, { workspace: string; route: string }> = {
      J21_cash: { workspace: "finance", route: "/admin/finance" },
      J22_coin: { workspace: "finance", route: "/admin/finance" },
      J23_delivery_ad: { workspace: "ads", route: "/admin/delivery-ads" },
      J24_banner: { workspace: "ads", route: "/admin/delivery-ads" },
      J25_popup: { workspace: "ads", route: "/admin/platform-popup" },
      J26_feed: { workspace: "ads", route: "/admin/feed-ads" },
      J27_member_support: { workspace: "support", route: "/admin/support" },
      J28_store_support: { workspace: "support", route: "/admin/support" },
      J29_home: { workspace: "delivery", route: "/admin/stores-home-shelves" },
      J30_category: { workspace: "delivery", route: "/admin/stores-category-policy" },
      J31_store: { workspace: "delivery", route: "/admin/stores" },
      J32_partner: { workspace: "ads", route: "/admin/delivery-ads/commercial-settings" },
      J33_notification: { workspace: "notifications", route: "/admin/notifications" },
      J34_reset: { workspace: "system", route: "/admin/prelaunch-reset" },
    };
    for (const [id, { workspace, route }] of Object.entries(findability)) {
      expect(workspaceOf(route), id).toBe(workspace);
    }
  });

  it("dissolves growth/common; keeps CUT J workspace order", () => {
    expect(adminMenu.map((w) => w.key)).toEqual([...CUT_J_WORKSPACE_ORDER]);
    expect(findAdminMenuByKey(adminMenu, "growth")).toBeUndefined();
    expect(findAdminMenuByKey(adminMenu, "common")).toBeUndefined();
  });

  it("forbids parallel shell routes and preserves CUT I carry honesty", () => {
    for (const shell of CUT_J_NAV_SSOT.newShellRoutesForbidden) {
      const rel = path.join(ROOT, "app", ...shell.slice(1).split("/"), "page.tsx");
      expect(existsSync(rel), shell).toBe(false);
    }
    expect(CUT_I_CARRY_INTO_J.financeF1F3F4F7).toBe("NOT_PROVEN");
    expect(CUT_I_CARRY_INTO_J.coinSaleRecognition).toBe("NOT_PROVEN");
    expect(CUT_I_CARRY_INTO_J.adsApplyActiveApp).toBe("NOT_PROVEN");
    expect(CUT_I_CARRY_INTO_J.pauseResumeEnd).toBe("NOT_PROVEN");
    expect(CUT_I_CARRY_INTO_J.popupRuntime).toBe("NOT_PROVEN");
    expect(CUT_I_CARRY_INTO_J.resetStorage).toBe("NOT_IMPLEMENTED");
    expect(CUT_I_CARRY_INTO_J.resetAuth).toBe("NOT_IMPLEMENTED");
  });
});
