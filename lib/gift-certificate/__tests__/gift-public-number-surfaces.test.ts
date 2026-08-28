import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

function source(path: string): string {
  return readFileSync(resolve(process.cwd(), path), "utf8");
}

describe("gift public number surfaces", () => {
  it("wallet and purchase success expose public gift number without using UUID as display identity", () => {
    const walletLoader = source("lib/gift-certificate/load-gift-wallet.ts");
    const walletUi = source("components/gift-certificate/GiftVisualCard.tsx");
    const buyerDetail = source("components/gift-certificate/BuyerGiftDetailView.tsx");

    expect(walletLoader).toContain("public_gift_number");
    expect(walletLoader).toContain("publicGiftNumber");
    expect(walletLoader).toContain('product?.title');
    expect(walletLoader).not.toContain("customerGiftDisplayTitle");
    expect(walletUi).toContain("data-gift-public-number");
    expect(buyerDetail).toContain("public_gift_number");
    expect(buyerDetail).toContain("data-gift-public-number");
  });

  it("owner redemption readback includes public number while remaining scoped to store redemptions", () => {
    const route = source("app/api/me/stores/[storeId]/gift-certificates/redemptions/route.ts");
    const ui = source("components/business/owner/OwnerGiftMoneyOpsPanel.tsx");

    expect(route).toContain("public_gift_number");
    expect(route).toContain("publicGiftNumber");
    expect(route).toContain(".eq(\"store_id\", sid)");
    expect(ui).toContain("data-owner-gift-public-number");
  });

  it("admin instance tracking is read-only, admin-gated via Ops Center single entry", () => {
    const route = source("app/api/admin/gift-certificates/tracking/route.ts");
    const instancesPanel = source("components/admin/gift/panels/AdminGiftInstancesPanel.tsx");
    const menu = source("components/admin/admin-menu.ts");
    const opsTabs = source("lib/gift-certificate/admin-gift-ops-tabs.ts");

    expect(route).toContain('requireAdminPermission("business")');
    expect(route).toContain("public_gift_number");
    expect(route).toContain("messenger_message_id");
    expect(route).not.toContain("message_body");
    expect(route).not.toMatch(/\b(insert|update|delete|upsert)\s*\(/i);
    // UI authority: Ops Center instances tab (legacy /tracking redirects here)
    expect(instancesPanel).toContain("/api/admin/gift-certificates/tracking");
    expect(instancesPanel).toContain("publicGiftNumber");
    expect(instancesPanel).toContain("fetchList");
    expect(instancesPanel).toContain("fetchInstanceDetail");
    expect(instancesPanel).toContain("openProductEdit");
    expect(instancesPanel).toContain("data-admin-gift-instance-trace-open");
    expect(instancesPanel).toContain("data-admin-gift-instance-detail-open");
    expect(instancesPanel).toContain("data-admin-gift-instance-detail-status");
    expect(instancesPanel).toContain("ADMIN_GIFT_PRIMARY_BTN_STYLE");
    expect(menu).toContain('path: "/admin/gift-certificates"');
    expect(menu).not.toContain('path: "/admin/gift-certificates/tracking"');
    expect(opsTabs).toContain('tracking: { tab: "instances" }');
  });
});
