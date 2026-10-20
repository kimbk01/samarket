import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { sumAdminQueueCountsForMenuKey } from "@/lib/admin/admin-action-queue-registry";

const read = (rel: string) => readFileSync(join(process.cwd(), rel), "utf8");

/**
 * COUNT SEMANTIC SSOT — TRADE_PROMO_PENDING vs FEED_AD_PENDING_REVIEW consumers.
 * Foundation-locked: Trade ads-applications must not consume Feed counts.
 */
describe("Admin count semantic SSOT contract", () => {
  it("action queue defines TRADE_PROMO_PENDING same filter as Trade Hub", () => {
    const aq = read("lib/admin/admin-action-queue.ts");
    const overview = read("lib/admin-products/admin-trade-overview-counts.ts");
    expect(aq).toContain("trade_promo_pending");
    expect(aq).toMatch(/point_promotion_orders[\s\S]*domain[\s\S]*trade[\s\S]*pending_review/);
    expect(overview).toMatch(/point_promotion_orders[\s\S]*domain[\s\S]*trade[\s\S]*pending_review/);
  });

  it("sidebar binds Trade leaf to tradePromoPending and Growth leaf to feedAdPending", () => {
    const sidebar = read("components/admin/sidebar/AdminSidebarItem.tsx");
    expect(sidebar).toContain("sumAdminQueueCountsForMenuKey(item.key, queueCategories)");
    const cats = [
      { key: "trade_promo_pending", count: 3, status: "ok", inTotal: true, nextActor: "admin", listHref: "x" },
      { key: "feed_ad_requests", count: 5, status: "ok", inTotal: true, nextActor: "admin", listHref: "y" },
    ] as const;
    // Regression: Trade leaf must not use Feed count (and vice versa)
    expect(sumAdminQueueCountsForMenuKey("ads-applications", cats)).toBe(3);
    expect(sumAdminQueueCountsForMenuKey("ads-feed-applications", cats)).toBe(5);
  });

  it("Listing report drill targets Trade product report queue", () => {
    // 거래 Admin 설계 v2 §C-3: 게시물 상세 = TradePostDetailPage, 신고 큐 canonical = /admin/trade/reports
    const detail = read("components/admin/trade/posts/TradePostDetailPage.tsx");
    expect(detail).toContain("/admin/trade/reports?targetId=");
  });

  it("Listing promo drill targets TRADE_PROMO list", () => {
    // 거래 Admin 설계 v2 §B-2: 거래 홍보 canonical = /admin/trade/promotions
    const detail = read("components/admin/trade/posts/TradePostDetailPage.tsx");
    expect(detail).toContain("/admin/trade/promotions?postId=");
  });

  it("does not invent Community promo durable badge consumer", () => {
    const sidebar = read("components/admin/sidebar/AdminSidebarItem.tsx");
    expect(sidebar).not.toContain("community-promotions");
    const aq = read("lib/admin/admin-action-queue.ts");
    expect(aq).not.toMatch(/community_promo_pending/);
  });
});
