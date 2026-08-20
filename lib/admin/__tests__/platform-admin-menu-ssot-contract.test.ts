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
  it("exposes exactly 11 top-level workspaces", () => {
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

  it("keeps Growth as sole owner of promoted-items and member-benefits", () => {
    expect(findAdminMenuByKey(adminMenu, "ads-paid")?.path).toBe("/admin/promoted-items");
    expect(findAdminMenuByKey(adminMenu, "ads-benefits")?.path).toBe("/admin/member-benefits");
    const growth = findAdminMenuByKey(adminMenu, "growth");
    expect(growth).toBeTruthy();
  });

  it("keeps notification domain settings under app-config only", () => {
    expect(findAdminMenuByKey(adminMenu, "settings-notifications")?.path).toBe(
      "/admin/settings/notifications"
    );
    expect(findAdminMenuByKey(adminMenu, "app-config")).toBeTruthy();
  });

  it("separates moderation from messenger", () => {
    const messengerKids = findAdminMenuByKey(adminMenu, "messenger")?.children ?? [];
    expect(messengerKids.some((c) => c.key === "reports")).toBe(false);
    expect(messengerKids.some((c) => c.key === "reviews")).toBe(false);
    expect(findAdminMenuByKey(adminMenu, "moderation")).toBeTruthy();
    expect(findAdminMenuByKey(adminMenu, "reports-posts")?.path).toBe("/admin/reports");
  });
});
