import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

const read = (rel: string) => readFileSync(join(process.cwd(), rel), "utf8");

/**
 * Slice 2 — TRADE vertical relation chain (presentation only).
 * Listing → Flow → Conversation → Reports → Promo. No writer redesign.
 */
describe("Admin Trade vertical relation contract", () => {
  it("Hub product-report ops lands on product target_type filter", () => {
    const hub = read("components/admin/trade/AdminTradeHub.tsx");
    expect(hub).toContain("/admin/reports?domain=trade&target_type=product");
    expect(hub).toContain("상품 신고");
  });

  it("Trade Flow sessions link Admin listing + Admin trade chat", () => {
    const flow = read("components/admin/trade-flow/AdminTradeFlowPage.tsx");
    expect(flow).toContain("/admin/products/");
    expect(flow).toContain("/admin/chats/trade?postId=");
  });

  it("Trade chat table links listing admin detail", () => {
    const table = read("components/admin/chats/AdminChatTable.tsx");
    expect(table).toContain("/admin/products/");
  });

  it("Trade promo queue links Admin listing (not only /post)", () => {
    const queue = read("components/admin/ads/AdminCommunityPromotionQueue.tsx");
    expect(queue).toContain("/admin/products/");
    expect(queue).toContain("admin_trade_promo_open_admin_listing");
  });

  it("does not invent trade_post_ads drill from listing detail", () => {
    const detail = read("components/admin/products/AdminProductDetailPage.tsx");
    expect(detail).not.toContain("/admin/trade-post-ads");
  });
});
