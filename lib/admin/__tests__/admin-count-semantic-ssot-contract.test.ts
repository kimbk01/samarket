import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

const read = (rel: string) => readFileSync(join(process.cwd(), rel), "utf8");

/**
 * COUNT SEMANTIC SSOT — TRADE_PROMO_PENDING vs FEED_AD_PENDING_REVIEW consumers.
 * Foundation-locked: Trade ads-applications must not consume Feed counts.
 */
describe("Admin count semantic SSOT contract", () => {
  it("action queue defines TRADE_PROMO_PENDING for trade+community pending_review Boost", () => {
    const aq = read("lib/admin/admin-action-queue.ts");
    const overview = read("lib/admin-products/admin-trade-overview-counts.ts");
    expect(aq).toContain("trade_promo_pending");
    expect(aq).toMatch(/point_promotion_orders[\s\S]*pending_review/);
    expect(aq).toMatch(/\["trade",\s*"community"\]/);
    expect(overview).toMatch(/point_promotion_orders[\s\S]*domain[\s\S]*trade[\s\S]*pending_review/);
  });

  it("sidebar binds applications hub to combined action-required ads counts", () => {
    const sidebar = read("components/admin/sidebar/AdminSidebarItem.tsx");
    expect(sidebar).toContain('item.key === "ads-applications-hub"');
    expect(sidebar).toContain("adsApplicationsActionRequired");
    expect(sidebar).toContain("deliveryAdOpsPendingCount");
    expect(sidebar).toContain("feedAdPendingCount");
    expect(sidebar).toContain("tradePromoPendingCount");
    expect(sidebar).toContain("platformPopupPendingCount");
  });

  it("Listing report drill targets Trade product report queue", () => {
    const detail = read("components/admin/products/AdminProductDetailPage.tsx");
    expect(detail).toContain(
      "/admin/reports?domain=trade&target_type=product&target="
    );
  });

  it("Listing promo drill targets TRADE_PROMO list", () => {
    const detail = read("components/admin/products/AdminProductDetailPage.tsx");
    expect(detail).toContain('/admin/ad-applications?domain=trade');
  });

  it("does not invent Community promo durable badge consumer", () => {
    const sidebar = read("components/admin/sidebar/AdminSidebarItem.tsx");
    expect(sidebar).not.toContain("community-promotions");
    const aq = read("lib/admin/admin-action-queue.ts");
    expect(aq).not.toMatch(/community_promo_pending/);
  });
});
