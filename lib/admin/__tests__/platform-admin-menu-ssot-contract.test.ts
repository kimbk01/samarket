import { describe, expect, it } from "vitest";
import { existsSync } from "node:fs";
import path from "node:path";
import {
  adminMenu,
  collectAdminMenuPathEntries,
} from "@/components/admin/admin-menu";
import { findAdminMenuByKey } from "@/lib/admin/find-admin-menu-item";

const ROOT = path.resolve(__dirname, "../../..");

const WORKSPACE_KEYS = [
  "dashboard",
  "common",
  "community",
  "trade",
  "delivery",
  "messenger",
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

describe("platform admin menu SSOT contract", () => {
  it("exposes exactly 7 top-level workspaces", () => {
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

  it("keeps system/growth as sole owner of promoted-items and member-benefits", () => {
    expect(findAdminMenuByKey(adminMenu, "ads-paid")?.path).toBe("/admin/promoted-items");
    expect(findAdminMenuByKey(adminMenu, "ads-benefits")?.path).toBe("/admin/member-benefits");
    const system = findAdminMenuByKey(adminMenu, "system");
    const systemKeys = new Set((system?.children ?? []).map((c) => c.key));
    expect(systemKeys.has("growth")).toBe(true);
  });

  it("keeps notification domain settings under system/app-config only", () => {
    expect(findAdminMenuByKey(adminMenu, "settings-notifications")?.path).toBe(
      "/admin/settings/notifications"
    );
    expect(findAdminMenuByKey(adminMenu, "app-config")).toBeTruthy();
  });

  it("moves common reports and chat reports to their canonical workspaces", () => {
    const commonKids = findAdminMenuByKey(adminMenu, "common")?.children ?? [];
    expect(commonKids.some((c) => c.key === "global-reports")).toBe(true);
    expect(findAdminMenuByKey(adminMenu, "global-reports")?.path).toBe("/admin/reports");

    const messengerKids = findAdminMenuByKey(adminMenu, "messenger")?.children ?? [];
    expect(messengerKids.some((c) => c.key === "reports")).toBe(false);
    expect(messengerKids.some((c) => c.key === "reviews")).toBe(false);
    expect(messengerKids.some((c) => c.key === "chat-reported")).toBe(true);
    expect(findAdminMenuByKey(adminMenu, "moderation")).toBeUndefined();
    expect(findAdminMenuByKey(adminMenu, "reports-posts")?.path).toBe(
      "/admin/reports?domain=trade&target_type=product"
    );
    expect(findAdminMenuByKey(adminMenu, "reports-posts")?.matchPaths).toBeUndefined();
  });

  it("Cut B: Trade workspace owns Marketplace ops leaves (routes KEEP)", () => {
    const trade = findAdminMenuByKey(adminMenu, "trade");
    const tradeKeys = new Set((trade?.children ?? []).map((c) => c.key));
    expect(tradeKeys.has("reports-posts")).toBe(true);
    expect(tradeKeys.has("reviews-trade")).toBe(true);
    expect(tradeKeys.has("chat-trade")).toBe(true);
    expect(tradeKeys.has("ads-applications")).toBe(true);
    expect(tradeKeys.has("trade-users")).toBe(true);
    expect(tradeKeys.has("trade-audit")).toBe(true);
    // No Store finance / Trade Payment·Settlement under Trade
    expect(tradeKeys.has("store-settlements-admin")).toBe(false);
    expect(tradeKeys.has("delivery-orders-settlement")).toBe(false);
    expect([...tradeKeys].some((k) => /payment|settlement/i.test(k))).toBe(false);

    const commonKeys = new Set(
      (findAdminMenuByKey(adminMenu, "common")?.children ?? []).map((c) => c.key)
    );
    expect(commonKeys.has("reports-posts")).toBe(false);
    expect(commonKeys.has("reviews-trade")).toBe(false);

    const messengerKeys = new Set(
      (findAdminMenuByKey(adminMenu, "messenger")?.children ?? []).map((c) => c.key)
    );
    expect(messengerKeys.has("chat-trade")).toBe(false);
    expect(messengerKeys.has("chat-trade-messenger")).toBe(true);

    const growthAds = findAdminMenuByKey(adminMenu, "ads")?.children ?? [];
    expect(growthAds.some((c) => c.key === "ads-applications")).toBe(false);
    expect(growthAds.some((c) => c.key === "ads-feed-applications")).toBe(true);
  });
});
