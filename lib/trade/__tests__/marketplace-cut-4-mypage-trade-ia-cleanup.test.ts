import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";
import { getOrdersSectionCtas } from "@/lib/my/managed-my-section-ctas-i18n";
import { MYPAGE_MOBILE_NAV } from "@/lib/mypage/mypage-mobile-nav-registry";

function src(rel: string): string {
  return readFileSync(resolve(process.cwd(), rel), "utf8");
}

describe("TRADE UI CUT 4 — MyPage trade IA cleanup", () => {
  it("getOrdersSectionCtas has no Trade chat/sales destinations", () => {
    const ctas = getOrdersSectionCtas();
    expect(ctas).toHaveLength(1);
    expect(ctas[0]?.href).toBe("/mypage/store-orders");
    for (const link of ctas) {
      expect(link.href).not.toContain("/community-messenger/trade-chats");
      expect(link.href).not.toBe("/mypage/trade/sales");
    }
  });

  it("mobile trade section removes legacy purchases entry", () => {
    const trade = MYPAGE_MOBILE_NAV.find((s) => s.id === "trade");
    expect(trade?.items.some((i) => i.id === "purchases")).toBe(false);
  });

  it("Trade sales/reviews surfaces use trade chat vocabulary keys", () => {
    const sales = src("components/mypage/sales/SalesHistoryCard.tsx");
    expect(sales).toContain("mypage_comp_trade_chat_view");
    expect(sales).toContain("mypage_comp_trade_chat_revisit");
    expect(sales).not.toContain('t("mypage_comp_order_chat_view")');
    expect(sales).not.toContain('t("mypage_comp_order_chat_revisit")');

    const received = src("components/mypage/reviews/TradeReviewsManagementView.tsx");
    expect(received).toContain("mypage_comp_trade_chat");
    expect(received).not.toContain('t("mypage_comp_order_chat")');

    const written = src("components/mypage/reviews/MyWrittenReviewsView.tsx");
    expect(written).toContain("mypage_comp_trade_chat");
    expect(written).not.toContain('t("mypage_comp_order_chat")');
  });

  it("store order surfaces keep order chat keys", () => {
    const storeDetail = src("components/mypage/MyStoreOrderDetailView.tsx");
    expect(storeDetail).toContain("mypage_comp_order_chat_nav");
    expect(storeDetail).not.toContain("mypage_comp_trade_chat");
  });
});
