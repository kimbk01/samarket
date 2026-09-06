import { describe, expect, it } from "vitest";
import { adminMenu } from "@/components/admin/admin-menu";
import { findAdminMenuByKey } from "@/lib/admin/find-admin-menu-item";

/**
 * Domain SSOT IA — CUT J Domain / Common Operation separation.
 * Menu ownership only; writers stay domain-specific (no unified tables).
 */
describe("domain admin SSOT IA contract (CUT J)", () => {
  it("exposes CUT J top-level workspaces in OWNER order", () => {
    expect(adminMenu.map((w) => w.key)).toEqual([
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

  it("System owns global reports and audit; Trade reports are domain-scoped only", () => {
    expect(findAdminMenuByKey(adminMenu, "global-reports")?.path).toBe("/admin/reports");
    expect(findAdminMenuByKey(adminMenu, "audit-logs")?.path).toBe("/admin/audit-logs");
    const tradeReports = findAdminMenuByKey(adminMenu, "reports-posts");
    expect(tradeReports?.path).toBe("/admin/reports?domain=trade&target_type=product");
    expect(tradeReports?.matchPaths).toEqual(["/admin/reports?domain=trade"]);
    expect(tradeReports?.matchPaths ?? []).not.toContain("/admin/reports");
  });

  it("splits promo presentation by domain (trade promote under ads workspace deep-links; community stays community)", () => {
    expect(findAdminMenuByKey(adminMenu, "ads-applications")).toBeUndefined();
    expect(findAdminMenuByKey(adminMenu, "ads-feed")).toBeUndefined();
    expect(findAdminMenuByKey(adminMenu, "ads-advertising-workspace")?.path).toBe(
      "/admin/advertising"
    );
    expect(
      findAdminMenuByKey(adminMenu, "ads-advertising-workspace")?.matchPathPrefixes
    ).toEqual(
      expect.arrayContaining(["/admin/ad-applications", "/admin/feed-ads"])
    );
    expect(findAdminMenuByKey(adminMenu, "community-promotions")?.path).toBe(
      "/admin/community/promotions"
    );
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

  it("Delivery owns store reports and real settlements; config stays delivery", () => {
    expect(findAdminMenuByKey(adminMenu, "store-reports-admin")?.path).toBe("/admin/store-reports");
    expect(findAdminMenuByKey(adminMenu, "store-settlements-admin")?.path).toBe(
      "/admin/store-settlements"
    );
    expect(findAdminMenuByKey(adminMenu, "stores-home-shelves")?.path).toBe(
      "/admin/stores-home-shelves"
    );
    expect(findAdminMenuByKey(adminMenu, "stores-browse-policy")?.path).toBe(
      "/admin/stores-category-policy"
    );
  });

  it("CONFIG vs OPERATION: advertising workspace under ads, not delivery sidebar", () => {
    const deliveryOps = findAdminMenuByKey(adminMenu, "delivery-section-operations");
    const opsKeys = (deliveryOps?.children ?? []).map((c) => c.key);
    expect(opsKeys).not.toContain("store-ads-section");
    expect(opsKeys).not.toContain("delivery-ads-control");
    expect(findAdminMenuByKey(adminMenu, "delivery-ads-control")).toBeUndefined();
    expect(findAdminMenuByKey(adminMenu, "ads-advertising-workspace")?.path).toBe(
      "/admin/advertising"
    );
    expect(adminMenu.find((w) => w.key === "ads")).toBeTruthy();
  });
});
