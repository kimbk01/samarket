import { readFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { computeStoreCheckoutPayable } from "@/lib/stores/store-checkout-payable";
import { resolveStoreCheckoutClientError } from "@/lib/stores/resolve-store-checkout-client-error";

const src = (rel: string) => readFileSync(path.join(process.cwd(), rel), "utf8");

describe("CG-01 confirm dialog shows gift used + forfeited amount", () => {
  const gift = { instanceId: "g1", remainingBalance: 1000 } as never;
  it("forfeit appears when the cart dropped below the gift after it was chosen", () => {
    const p = computeStoreCheckoutPayable({
      grossPhp: 400,
      couponQuotes: [],
      appliedUserCouponId: null,
      eligibleGifts: [gift],
      appliedGiftInstanceId: "g1",
    });
    expect(p.giftUsedPhp).toBe(400);
    expect(p.giftForfeitedPhp).toBe(600);
    expect(p.payablePhp).toBe(0);
  });
  it("no forfeit when the gift is fully used", () => {
    const p = computeStoreCheckoutPayable({
      grossPhp: 1500,
      couponQuotes: [],
      appliedUserCouponId: null,
      eligibleGifts: [gift],
      appliedGiftInstanceId: "g1",
    });
    expect(p.giftForfeitedPhp).toBe(0);
    expect(p.payablePhp).toBe(500);
  });
  it("cart passes both amounts into the submit confirm dialog", () => {
    const cart = src("components/stores/StoreCommerceCartPageClient.tsx");
    expect(cart).toContain("giftForfeitedPhp: payableForConfirm.giftForfeitedPhp");
    expect(cart).toContain("giftForfeitedPhp={checkoutConfirmPayload.giftForfeitedPhp}");
    const dlg = src("components/stores/cart/StoreCheckoutSubmitConfirmDialog.tsx");
    expect(dlg).toContain('data-checkout-confirm-gift-forfeit="1"');
    expect(dlg).toContain('t("gift_u4_cart_forfeit"');
  });
});

describe("CG-02 coupon error codes from the order RPC map to messages", () => {
  const t = (k: string) => `T:${k}`;
  it.each([
    ["COUPON_REVOKED", "T:store_err_coupon_inactive"],
    ["coupon_entitlement_required", "T:store_err_coupon_not_found"],
    ["coupon_required_for_discount", "T:store_err_coupon_invalid"],
  ])("%s", (code, expected) => {
    expect(resolveStoreCheckoutClientError(t as never, code, {})).toBe(expected);
  });
});

describe("CG-03 rejected coupon/gift is released and re-quoted", () => {
  it("coupon_* failure clears selection and bumps the quote reload nonce", () => {
    const cart = src("components/stores/StoreCommerceCartPageClient.tsx");
    const i = cart.indexOf('code.startsWith("coupon_")');
    expect(i).toBeGreaterThan(-1);
    const block = cart.slice(i, i + 500);
    expect(block).toContain("setAppliedUserCouponId(null)");
    expect(block).toContain("setCouponQuotesReloadNonce((n) => n + 1)");
    expect(cart).toContain("}, [store?.id, subtotalPhp, couponQuotesReloadNonce]);");
    expect(cart).toContain("setEligibleGiftsReloadNonce((n) => n + 1)");
  });
});

describe("CG-04 wallet treats a revoked campaign as not usable", () => {
  it("selects lifecycle_state and buckets revoked campaigns as expired", () => {
    const w = src("lib/stores/load-customer-coupon-wallet-cards.ts");
    expect(w.match(/lifecycle_state\)/g)?.length).toBe(2);
    expect(w).toContain('(campaignRevoked && status !== "redeemed")');
  });
});
