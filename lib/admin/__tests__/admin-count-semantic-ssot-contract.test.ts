import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

const read = (rel: string) => readFileSync(join(process.cwd(), rel), "utf8");

/**
 * COUNT SEMANTIC SSOT — TRADE_PROMO_PENDING vs FEED_AD_PENDING_REVIEW consumers.
 * Foundation-locked: action-queue filters stay domain-split; sidebar FINAL LOCK rolls
 * pending counts onto ads-advertising-workspace (removed per-leaf keys).
 */
describe("Admin count semantic SSOT contract", () => {
  it("action queue defines TRADE_PROMO_PENDING same filter as Trade Hub", () => {
    const aq = read("lib/admin/admin-action-queue.ts");
    const overview = read("lib/admin-products/admin-trade-overview-counts.ts");
    expect(aq).toContain("trade_promo_pending");
    expect(aq).toMatch(/point_promotion_orders[\s\S]*domain[\s\S]*trade[\s\S]*pending_review/);
    expect(overview).toMatch(/point_promotion_orders[\s\S]*domain[\s\S]*trade[\s\S]*pending_review/);
  });

  it("sidebar binds ads pending counts to advertising workspace (FINAL LOCK)", () => {
    const sidebar = read("components/admin/sidebar/AdminSidebarItem.tsx");
    expect(sidebar).toContain('item.key === "ads-advertising-workspace"');
    expect(sidebar).toContain("adsWorkspacePendingCount");
    expect(sidebar).toContain("tradePromoPendingCount");
    expect(sidebar).toContain("feedAdPendingCount");
    expect(sidebar).toContain("deliveryAdOpsPendingCount");
    // Removed menu leaves must not remain as badge targets
    expect(sidebar).not.toContain('item.key === "ads-applications"');
    expect(sidebar).not.toContain('item.key === "ads-feed-applications"');
    expect(sidebar).not.toContain('item.key === "delivery-ads-control"');
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
