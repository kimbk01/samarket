import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { adminMenu } from "@/components/admin/admin-menu";
import { findAdminMenuByKey } from "@/lib/admin/find-admin-menu-item";

/**
 * Domain SSOT IA — OWNER operating model (OM-0…OM-6).
 * Menu ownership only; writers stay domain-specific (no unified tables).
 */
describe("domain admin SSOT IA contract", () => {
  it("exposes exactly 7 top-level workspaces in OWNER order", () => {
    expect(adminMenu.map((w) => w.key)).toEqual([
      "dashboard",
      "common",
      "community",
      "trade",
      "delivery",
      "messenger",
      "system",
    ]);
  });

  it("Common owns global reports and audit; Trade reports are domain-scoped only", () => {
    expect(findAdminMenuByKey(adminMenu, "global-reports")?.path).toBe("/admin/reports");
    expect(findAdminMenuByKey(adminMenu, "audit-logs")?.path).toBe("/admin/audit-logs");
    expect(findAdminMenuByKey(adminMenu, "reports-posts")?.path).toBe(
      "/admin/reports?domain=trade&target_type=product"
    );
    expect(findAdminMenuByKey(adminMenu, "reports-posts")?.matchPaths ?? []).not.toContain(
      "/admin/reports"
    );
  });

  it("splits promo presentation by domain (no bare multi-queue leaf under Trade)", () => {
    expect(findAdminMenuByKey(adminMenu, "ads-applications")?.path).toBe(
      "/admin/ad-applications?domain=trade"
    );
    expect(findAdminMenuByKey(adminMenu, "community-promotions")?.path).toBe(
      "/admin/community/promotions"
    );
    const growthFeed = findAdminMenuByKey(adminMenu, "ads-feed");
    expect(growthFeed?.path).toBe("/admin/feed-ads");
  });

  it("Messenger exposes general/group/trade/order/reported ops leaves", () => {
    expect(findAdminMenuByKey(adminMenu, "chat-general")?.path).toBe("/admin/chats/general");
    expect(findAdminMenuByKey(adminMenu, "chat-group")?.path).toBe("/admin/chats/group");
    expect(findAdminMenuByKey(adminMenu, "chat-trade-messenger")?.path).toBe(
      "/admin/chats/trade?from=messenger"
    );
    expect(findAdminMenuByKey(adminMenu, "delivery-order-chats-messenger")?.path).toBe(
      "/admin/order-chats?from=messenger"
    );
    expect(findAdminMenuByKey(adminMenu, "chat-reported")?.path).toBe("/admin/chats/reported");
  });

  it("Delivery owns store reports and real settlements; hollow order subpaths redirect", () => {
    expect(findAdminMenuByKey(adminMenu, "store-reports-admin")?.path).toBe("/admin/store-reports");
    expect(findAdminMenuByKey(adminMenu, "store-settlements-admin")?.path).toBe(
      "/admin/store-settlements"
    );
    expect(findAdminMenuByKey(adminMenu, "delivery-orders-settlement")).toBeUndefined();
    expect(findAdminMenuByKey(adminMenu, "delivery-orders-reports")).toBeUndefined();
    const settlePage = readFileSync(
      resolve(process.cwd(), "app/admin/stores/orders/settlements/page.tsx"),
      "utf8"
    );
    const reportPage = readFileSync(
      resolve(process.cwd(), "app/admin/stores/orders/reports/page.tsx"),
      "utf8"
    );
    expect(settlePage).toMatch(/permanentRedirect\(["']\/admin\/store-settlements["']\)/);
    expect(reportPage).toMatch(/permanentRedirect\(["']\/admin\/store-reports["']\)/);
  });

  it("Community posts page source no longer loads Trade posts writers", () => {
    const src = readFileSync(
      resolve(process.cwd(), "app/admin/community/posts/AdminPostsPageContent.tsx"),
      "utf8"
    );
    expect(src).not.toMatch(/getAdminPosts/);
    expect(src).not.toMatch(/updatePostStatusAdmin/);
    expect(src).not.toMatch(/PostsTab/);
  });

  it("Ad applications page gates queues by domain query", () => {
    const src = readFileSync(
      resolve(process.cwd(), "components/admin/ads/AdminAdApplicationsPage.tsx"),
      "utf8"
    );
    expect(src).toMatch(/normalizeDomain/);
    expect(src).toMatch(/domain === "trade"/);
    expect(src).toMatch(/domain === "community"/);
    expect(src).toMatch(/domain === "feed"/);
  });
});
