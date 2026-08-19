import { describe, expect, it } from "vitest";
import { isTradeReviewWriteEligible } from "@/lib/trade/trade-review-eligibility";

const buyer = "buyer-1";
const seller = "seller-1";
const other = "other-1";

function base(overrides: Partial<Parameters<typeof isTradeReviewWriteEligible>[0]> = {}) {
  return isTradeReviewWriteEligible({
    currentUserId: buyer,
    roomBuyerId: buyer,
    roomSellerId: seller,
    productStatus: "sold",
    soldBuyerId: buyer,
    tradeFlowStatus: "buyer_confirmed",
    buyerReviewSubmitted: false,
    ...overrides,
  });
}

describe("isTradeReviewWriteEligible", () => {
  it("allows confirmed sold buyer", () => {
    expect(base()).toBe(true);
    expect(base({ tradeFlowStatus: "review_pending" })).toBe(true);
  });

  it("rejects non-buyer", () => {
    expect(base({ currentUserId: seller })).toBe(false);
  });

  it("rejects buyer != sold buyer", () => {
    expect(base({ soldBuyerId: other })).toBe(false);
    expect(base({ soldBuyerId: null })).toBe(false);
  });

  it("rejects unsold listing", () => {
    expect(base({ productStatus: "active" })).toBe(false);
  });

  it("rejects dispute and pre-confirm flows", () => {
    expect(base({ tradeFlowStatus: "dispute" })).toBe(false);
    expect(base({ tradeFlowStatus: "seller_marked_done" })).toBe(false);
    expect(base({ tradeFlowStatus: "chatting" })).toBe(false);
  });

  it("rejects already reviewed", () => {
    expect(base({ buyerReviewSubmitted: true })).toBe(false);
  });
});

describe("canOpenTradeReviewSheet", () => {
  it("mirrors eligibility for Trade Chat gate", async () => {
    const { canOpenTradeReviewSheet } = await import("@/lib/trade/can-open-trade-review-sheet");
    expect(
      canOpenTradeReviewSheet({
        currentUserId: buyer,
        roomBuyerId: buyer,
        roomSellerId: seller,
        productStatus: "sold",
        soldBuyerId: buyer,
        tradeFlowStatus: "buyer_confirmed",
        buyerReviewSubmitted: false,
      })
    ).toBe(true);
    expect(
      canOpenTradeReviewSheet({
        currentUserId: seller,
        roomBuyerId: buyer,
        roomSellerId: seller,
        productStatus: "sold",
        soldBuyerId: buyer,
        tradeFlowStatus: "buyer_confirmed",
        buyerReviewSubmitted: false,
      })
    ).toBe(false);
  });
});
