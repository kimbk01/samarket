import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

const read = (rel: string) => readFileSync(join(process.cwd(), rel), "utf8");

/**
 * Slice 2 — TRADE vertical relation chain (presentation only).
 * Listing → Flow → Conversation → Reports → Promo. No writer redesign.
 */
describe("Admin Trade vertical relation contract", () => {
  it("Hub product-report ops lands on trade report queue", () => {
    // 거래 Admin 설계 v2 §E: 허브 = TradeDashboardPage, 신고 큐 canonical = /admin/trade/reports
    const hub = read("components/admin/trade/dashboard/TradeDashboardPage.tsx");
    expect(hub).toContain("/admin/trade/reports?tab=open");
    // 문구는 카탈로그 키 (L25) — 화면 글자는 그대로 「처리할 신고」
    expect(hub).toContain('label={t("admin_trade_regions_th_open_reports")} value={n(pending?.openReports)}');
    expect(read("lib/i18n/catalog/copy-admin-l25-trade.ts")).toContain('admin_trade_regions_th_open_reports: "처리할 신고"');
  });

  it("Trade Flow sessions link Admin listing + Admin trade chat", () => {
    const flow = read("components/admin/trade-flow/AdminTradeFlowPage.tsx");
    expect(flow).toContain("/admin/products/");
    // 설계 v2 §8: 거래 흐름 → Admin 방 상세 (레거시 상세가 사용자 앱 CM 방 상세로 보낸다). 사용자 앱 방은 열지 않는다.
    expect(flow).toContain("/admin/chats/${encodeURIComponent(s.id)}");
    expect(flow).not.toContain("tradeChatNotificationHref");
  });

  it("Trade chat table links listing admin detail", () => {
    const table = read("components/admin/chats/AdminChatTable.tsx");
    expect(table).toContain("/admin/products/");
  });

  it("does not invent trade_post_ads drill from listing detail", () => {
    const detail = read("components/admin/trade/posts/TradePostDetailPage.tsx");
    expect(detail).not.toContain("/admin/trade-post-ads");
  });
});
