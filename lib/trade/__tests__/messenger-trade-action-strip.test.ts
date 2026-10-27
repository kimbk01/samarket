import { describe, expect, it } from "vitest";
import { resolveMessengerTradeActionStripKind } from "@/lib/trade/messenger-trade-action-strip";

const S = "seller-1";
const B = "buyer-1";
const base = {
  sellerId: S,
  buyerId: B,
  hasProduct: true,
  productStatus: "active",
  tradeFlowStatus: "chatting",
  soldBuyerId: null,
  buyerReviewSubmitted: false,
};

describe("resolveMessengerTradeActionStripKind (PR-01)", () => {
  it("seller sees listing controls while chatting and not sold", () => {
    expect(resolveMessengerTradeActionStripKind({ ...base, viewerUserId: S })).toBe("seller_listing");
  });

  it("buyer has nothing to do while chatting — strip hidden", () => {
    expect(resolveMessengerTradeActionStripKind({ ...base, viewerUserId: B })).toBeNull();
  });

  it("buyer must confirm after seller marks done; seller then waits", () => {
    const done = { ...base, productStatus: "sold", tradeFlowStatus: "seller_marked_done", soldBuyerId: B };
    expect(resolveMessengerTradeActionStripKind({ ...done, viewerUserId: B })).toBe("buyer_confirm");
    expect(resolveMessengerTradeActionStripKind({ ...done, viewerUserId: S })).toBeNull();
  });

  it("buyer can write review after confirm, hidden once submitted", () => {
    const confirmed = { ...base, productStatus: "sold", tradeFlowStatus: "buyer_confirmed", soldBuyerId: B };
    expect(resolveMessengerTradeActionStripKind({ ...confirmed, viewerUserId: B })).toBe("review");
    expect(
      resolveMessengerTradeActionStripKind({ ...confirmed, viewerUserId: B, buyerReviewSubmitted: true })
    ).toBeNull();
  });

  it("buyer of a room sold to someone else gets the notice", () => {
    expect(
      resolveMessengerTradeActionStripKind({
        ...base,
        viewerUserId: B,
        productStatus: "sold",
        soldBuyerId: "other",
      })
    ).toBe("notice");
  });

  it("no viewer → nothing", () => {
    expect(resolveMessengerTradeActionStripKind({ ...base, viewerUserId: "" })).toBeNull();
  });
});
