import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

function src(rel: string): string {
  return readFileSync(resolve(process.cwd(), rel), "utf8");
}

describe("marketplace UI-6 MY selling listings contract", () => {
  it("MyProductCard uses price → title → location with seller status/time and promo badge", () => {
    const card = src("components/mypage/products/MyProductCard.tsx");
    const body = card.slice(card.indexOf("return ("));
    const priceIdx = body.indexOf("POST_LIST_PRICE_CLASS");
    const titleIdx = body.indexOf("POST_LIST_TITLE_CLASS");
    const locationIdx = body.indexOf("POST_LIST_META_TEXT_CLASS");
    expect(priceIdx).toBeGreaterThan(-1);
    expect(titleIdx).toBeGreaterThan(priceIdx);
    expect(locationIdx).toBeGreaterThan(titleIdx);
    expect(card).toContain("formatTimeAgo");
    expect(card).toContain("marketplace_seller_listing_status_live");
    expect(card).toContain("marketplace_seller_listing_status_sold");
    expect(card).toContain("trade_promo_badge");
    expect(card).not.toContain("<TradeListingStatusBadge");
    expect(card).not.toContain("mypage_comp_product_primary_hub_hint");
  });

  it("MyProductActions exposes seller menu without 4-state listing section", () => {
    const actions = src("components/mypage/products/MyProductActions.tsx");
    expect(actions).toContain("mypage_comp_product_edit");
    expect(actions).toContain("trade_promo_detail_cta");
    expect(actions).toContain("mypage_comp_product_hide");
    expect(actions).toContain("mypage_comp_product_delete");
    expect(actions).not.toContain("trade_listing_step_completed");
    expect(actions).not.toContain("onSellerListingStateChange");
    expect(actions).not.toContain("mypage_comp_product_listing_section");
    expect(actions).not.toContain("mypage_comp_product_bump");
    expect(actions).not.toContain("mypage_comp_product_go_promotion");
    expect(actions).not.toContain("LISTING_MENU_ORDER");
  });

  it("MyProductsView removes secondary hub banner", () => {
    const view = src("components/mypage/products/MyProductsView.tsx");
    expect(view).not.toContain("mypage_comp_product_primary_hub_hint");
    expect(view).not.toContain("mypage_comp_product_go_sales_hub");
    expect(view).toContain("isPromoted={promotedTargetIds.has(product.id)}");
    expect(view).toContain("tradeRows={tradesByPostId.get(product.id)");
  });
});
