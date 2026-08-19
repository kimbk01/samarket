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

  it("MyProductCard embeds buyer trade rows — no PostSellerTradeStrip", () => {
    const card = src("components/mypage/products/MyProductCard.tsx");
    expect(card).toContain("SellerTradeRow");
    expect(card).not.toContain("PostSellerTradeStrip");
    expect(card).not.toContain("activeTradeCount");
  });

  it("MyProductsView loads sales once and groups by post — not per-card chats API", () => {
    const view = src("components/mypage/products/MyProductsView.tsx");
    expect(view).toContain("fetchTradeHistorySalesBySession");
    expect(view).toContain("groupSalesRowsByPostId");
    expect(view).toContain("tradesByPostId");
    expect(view).not.toContain("post-buyer-chats");
    expect(view).not.toContain("PostSellerTradeStrip");
  });

  it("SalesHistoryCard is sales history only — no listing/transaction mutations", () => {
    const card = src("components/mypage/sales/SalesHistoryCard.tsx");
    expect(card).toContain("marketplace_seller_trade_chat_primary");
    expect(card).toContain("mypage_comp_sales_buyer_review_view");
    expect(card).not.toContain("seller-complete");
    expect(card).not.toContain("seller-listing-state");
    expect(card).not.toContain("mypage_comp_sales_to_inquiry");
    expect(card).not.toContain("mypage_comp_product_cancel_sale");
    expect(card).not.toContain("owner-status");
  });

  it("trade sales route redirects to unified listings", () => {
    const page = src("app/(main)/mypage/trade/sales/page.tsx");
    expect(page).toContain('redirect("/mypage/products")');
    expect(page).not.toContain("SellerHubNav");
  });

  it("TradeFlowBanner keeps in-room transaction actions", () => {
    const banner = src("components/trade/TradeFlowBanner.tsx");
    expect(banner).toContain("/seller-complete");
    expect(banner).toContain("/buyer-confirm");
    expect(banner).toContain("/buyer-issue");
    expect(banner).toContain("onPersistListing");
  });
});
