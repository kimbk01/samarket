import { describe, expect, it } from "vitest";
import { existsSync } from "node:fs";
import path from "node:path";
import {
  adminMenu,
  collectAdminMenuPathEntries,
} from "@/components/admin/admin-menu";
import { findAdminMenuByKey } from "@/lib/admin/find-admin-menu-item";

const ROOT = path.resolve(__dirname, "../../..");

/** CUT J — Domain / Common Operation IA */
const WORKSPACE_KEYS = [
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
] as const;

const REDIRECT_ONLY_PATHS = [
  "/admin/delivery-orders",
  "/admin/delivery/bottom-nav",
  "/admin/menus",
  "/admin/posts",
  "/admin/products",
  "/admin/behavior-events",
  "/admin/order-notifications/settings",
  "/admin/operations",
] as const;

function pageExistsForMenuPath(menuPath: string): boolean {
  const base = menuPath.split("#")[0]?.split("?")[0] ?? menuPath;
  if (base === "/admin") {
    return existsSync(path.join(ROOT, "app/admin/page.tsx"));
  }
  return existsSync(path.join(ROOT, "app", ...base.slice(1).split("/"), "page.tsx"));
}

describe("platform admin menu SSOT contract (CUT J)", () => {
  it("exposes CUT J top-level workspaces in order", () => {
    expect(adminMenu.map((w) => w.key)).toEqual([...WORKSPACE_KEYS]);
  });

  it("enforces one canonical path = one visible menu leaf", () => {
    const entries = collectAdminMenuPathEntries(adminMenu);
    const counts = new Map<string, string[]>();
    for (const e of entries) {
      const list = counts.get(e.path) ?? [];
      list.push(e.key);
      counts.set(e.path, list);
    }
    const dupes = [...counts.entries()].filter(([, keys]) => keys.length > 1);
    expect(dupes, JSON.stringify(dupes)).toEqual([]);
  });

  it("does not expose redirect-only paths as menu leaves", () => {
    const paths = new Set(collectAdminMenuPathEntries(adminMenu).map((e) => e.path));
    for (const redirectPath of REDIRECT_ONLY_PATHS) {
      expect(paths.has(redirectPath)).toBe(false);
    }
  });

  it("has a page for every non-pending menu path", () => {
    const missing: string[] = [];
    for (const e of collectAdminMenuPathEntries(adminMenu)) {
      if (e.pendingRoute) continue;
      if (!pageExistsForMenuPath(e.path)) missing.push(`${e.key}:${e.path}`);
    }
    expect(missing, missing.join("\n")).toEqual([]);
  });

  it("ads workspace owns promoted-items / feed / popup / delivery-ads primary", () => {
    expect(findAdminMenuByKey(adminMenu, "ads-paid")?.path).toBe("/admin/promoted-items");
    expect(findAdminMenuByKey(adminMenu, "ads-feed")?.path).toBe("/admin/feed-ads");
    expect(findAdminMenuByKey(adminMenu, "ads-platform-popup")?.path).toBe(
      "/admin/platform-popup"
    );
    expect(findAdminMenuByKey(adminMenu, "delivery-ads-control")?.path).toBe(
      "/admin/delivery-ads"
    );
    expect(findAdminMenuByKey(adminMenu, "ads-placement-map")?.path).toBe(
      "/admin/delivery-ads/inventory#placement-map"
    );
    expect(adminMenu.some((w) => w.key === "ads")).toBe(true);
    expect(findAdminMenuByKey(adminMenu, "growth")).toBeUndefined();
  });

  it("keeps notification domain settings under system/app-config only", () => {
    expect(findAdminMenuByKey(adminMenu, "settings-notifications")?.path).toBe(
      "/admin/settings/notifications"
    );
    expect(findAdminMenuByKey(adminMenu, "app-config")).toBeTruthy();
  });

  it("moves common reports into system-members; trade reports stay domain-scoped", () => {
    expect(findAdminMenuByKey(adminMenu, "common")).toBeUndefined();
    expect(findAdminMenuByKey(adminMenu, "global-reports")?.path).toBe("/admin/reports");
    expect(findAdminMenuByKey(adminMenu, "system-members")).toBeTruthy();

    const messengerKids = findAdminMenuByKey(adminMenu, "messenger")?.children ?? [];
    expect(messengerKids.some((c) => c.key === "chat-reported")).toBe(true);
    expect(findAdminMenuByKey(adminMenu, "reports-posts")?.path).toBe(
      "/admin/reports?domain=trade&target_type=product"
    );
  });

  it("Cut B + J: Trade keeps marketplace ops; ads-applications lives under ads", () => {
    const trade = findAdminMenuByKey(adminMenu, "trade");
    const tradeKeys = new Set((trade?.children ?? []).map((c) => c.key));
    expect(tradeKeys.has("reports-posts")).toBe(true);
    expect(tradeKeys.has("reviews-trade")).toBe(true);
    expect(tradeKeys.has("chat-trade")).toBe(true);
    expect(tradeKeys.has("ads-applications")).toBe(false);
    expect(tradeKeys.has("trade-post-ads")).toBe(true);
    expect(tradeKeys.has("trade-ad-policies")).toBe(true);
    expect(tradeKeys.has("store-settlements-admin")).toBe(false);

    expect(findAdminMenuByKey(adminMenu, "ads-applications")?.path).toBe(
      "/admin/ad-applications?domain=trade"
    );
    expect(findAdminMenuByKey(adminMenu, "ads-feed-applications")?.path).toBe(
      "/admin/ad-applications?domain=feed"
    );
  });

  it("Delivery workspace: domain ops without primary delivery-ads ownership", () => {
    const delivery = findAdminMenuByKey(adminMenu, "delivery");
    const topKeys = (delivery?.children ?? []).map((c) => c.key);
    expect(topKeys).toEqual([
      "business-shops",
      "delivery-section-policies",
      "delivery-section-settings",
      "delivery-section-operations",
      "delivery-section-management",
      "delivery-section-platform",
    ]);
    expect(findAdminMenuByKey(adminMenu, "store-ads-section")).toBeUndefined();
    expect(findAdminMenuByKey(adminMenu, "stores-home-shelves")?.path).toBe(
      "/admin/stores-home-shelves"
    );
    expect(findAdminMenuByKey(adminMenu, "stores-browse-policy")?.path).toBe(
      "/admin/stores-category-policy"
    );
    // Primary leaf for delivery-ads is under ads workspace
    const ops = findAdminMenuByKey(adminMenu, "delivery-section-operations");
    const opsKeys = new Set((ops?.children ?? []).map((c) => c.key));
    expect(opsKeys.has("store-ads-section")).toBe(false);
    expect(findAdminMenuByKey(adminMenu, "delivery-ads-control")?.path).toBe(
      "/admin/delivery-ads"
    );
  });

  it("Finance / Support / Notifications are top-level common workspaces", () => {
    expect(findAdminMenuByKey(adminMenu, "points-charge")?.path).toBe("/admin/point-charges");
    expect(findAdminMenuByKey(adminMenu, "store-finance-admin")?.path).toBe("/admin/finance");
    expect(findAdminMenuByKey(adminMenu, "cp-support-center")?.path).toBe("/admin/support");
    expect(findAdminMenuByKey(adminMenu, "cp-notification-engine")?.path).toBe(
      "/admin/notifications"
    );
    expect(findAdminMenuByKey(adminMenu, "system-prelaunch-reset")?.path).toBe(
      "/admin/prelaunch-reset"
    );
    // AST-002 store point charges not primary
    expect(findAdminMenuByKey(adminMenu, "store-point-charges-admin")).toBeUndefined();
    // platform-inquiries not primary
    const supportPaths = collectAdminMenuPathEntries(adminMenu)
      .filter((e) => e.path.includes("support") || e.path.includes("inquir"))
      .map((e) => e.path);
    expect(supportPaths).not.toContain("/admin/platform-inquiries");
  });
});
