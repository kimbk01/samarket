import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

function src(rel: string): string {
  return readFileSync(resolve(process.cwd(), rel), "utf8");
}

describe("TRADE UI CUT 2 — seller surface role cleanup", () => {
  it("MyProductActions keeps listing management only — no seller complete", () => {
    const actions = src("components/mypage/products/MyProductActions.tsx");
    expect(actions).toContain("mypage_comp_product_edit");
    expect(actions).toContain("trade_promo_detail_cta");
    expect(actions).toContain("mypage_comp_product_hide");
    expect(actions).toContain("mypage_comp_product_delete");
    expect(actions).not.toContain("onSellerListingStateChange");
    expect(actions).not.toContain("trade_listing_step_completed");
    expect(actions).not.toContain("seller-complete");
  });

  it("MyProductsView removes transaction buyer picker and seller-complete flow", () => {
    const view = src("components/mypage/products/MyProductsView.tsx");
    expect(view).not.toContain("TradeBuyerPickerModal");
    expect(view).not.toContain("postSellerCompleteRequest");
    expect(view).not.toContain("handleSellerListingStateChange");
  });

  it("PostSellerTradeStrip is informational + chat entry only — no seller complete mutation", () => {
    const strip = src("components/trade/PostSellerTradeStrip.tsx");
    expect(strip).toContain("tradeHubChatRoomHref");
    expect(strip).not.toContain("postSellerCompleteRequest");
    expect(strip).not.toContain("sellerComplete");
    expect(strip).not.toContain(">거래완료<");
  });

  it("SalesHistoryCard is sales history only — no listing/transaction mutations", () => {
    const card = src("components/mypage/sales/SalesHistoryCard.tsx");
    expect(card).toContain("mypage_comp_trade_chat_revisit");
    expect(card).not.toContain("mypage_comp_order_chat_revisit");
    expect(card).toContain("mypage_comp_sales_buyer_review_view");
    expect(card).not.toContain("seller-complete");
    expect(card).not.toContain("seller-listing-state");
    expect(card).not.toContain("mypage_comp_sales_to_inquiry");
    expect(card).not.toContain("mypage_comp_sales_promote_cta");
    expect(card).not.toContain("mypage_comp_sales_banner_cta");
    expect(card).not.toContain("mypage_comp_product_cancel_sale");
    expect(card).not.toContain("owner-status");
  });

  it("TradeFlowBanner keeps in-room transaction actions", () => {
    const banner = src("components/trade/TradeFlowBanner.tsx");
    expect(banner).toContain("/seller-complete");
    expect(banner).toContain("/buyer-confirm");
    expect(banner).toContain("/buyer-issue");
    expect(banner).toContain("onPersistListing");
  });
});
