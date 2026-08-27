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

  it("keeps wallet empty browse CTA and hides store detail strip when no active products exist", () => {
    const wallet = source("components/mypage/CustomerGiftCertificateWallet.tsx");
    const strip = source("components/stores/store-detail/StoreDetailGiftStrip.tsx");

    expect(wallet).toContain("data-gift-wallet-empty");
    expect(wallet).toContain("data-gift-wallet-empty-browse");
    expect(wallet).toContain("보유한 상품권이 없습니다.");
    expect(strip).toContain("if (!ready || products.length === 0) return null");
  });

  it("keeps other-store checkout exclusion on server and shows public number in selector", () => {
    const eligible = source("lib/gift-certificate/checkout-eligible-gifts.ts");
    const cart = source("components/stores/cart/StoreCartGiftApplyPanel.tsx");

    expect(eligible).toContain("inst.storeId.trim() !== storeId");
    expect(eligible).toContain("publicGiftNumber");
    expect(cart).toContain("data-cart-gift-public-number");
  });
});
