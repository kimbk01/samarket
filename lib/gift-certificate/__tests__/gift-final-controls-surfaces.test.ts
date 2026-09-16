import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

function source(path: string): string {
  return readFileSync(resolve(process.cwd(), path), "utf8");
}

describe("gift final buyer/admin control surfaces", () => {
  it("separates mall empty from API error with retry", () => {
    const mall = source("components/gift-certificate/BuyerGiftMallView.tsx");
    const catalog = source("lib/i18n/catalog/gift-certificate-u2.ts");

    expect(mall).toContain("data-gift-mall-error");
    expect(mall).toContain("data-gift-mall-empty");
    expect(mall).toContain("setLoadError(true)");
    expect(catalog).toContain("현재 판매 중인 상품권이 없습니다.");
    expect(catalog).toContain("상품권을 불러오지 못했습니다.");
    expect(catalog).toContain("다시 시도");
  });

  it("keeps wallet buy CTA and does not remount store-detail gift strip", () => {
    const wallet = source("components/orders/customer-commerce/CustomerGiftWalletBody.tsx");
    const summary = source("components/stores/store-detail/StoreDetailSummarySection.tsx");

    expect(wallet).toContain("data-gift-wallet-buy-cta");
    expect(summary).not.toContain("StoreDetailGiftStrip");
  });

  it("keeps other-store checkout exclusion on server and shows public number in selector", () => {
    const eligible = source("lib/gift-certificate/checkout-eligible-gifts.ts");
    const cart = source("components/stores/cart/StoreCartGiftApplyPanel.tsx");

    expect(eligible).toContain("giftInstanceAllowsCheckoutStore");
    expect(eligible).toContain("publicGiftNumber");
    expect(cart).toContain("data-cart-gift-public-number");
  });
});
