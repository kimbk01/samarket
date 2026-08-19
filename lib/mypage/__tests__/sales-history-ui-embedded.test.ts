import { describe, expect, it } from "vitest";
import { sellerEmbeddedTradeRowStatusLabel } from "@/lib/mypage/sales-history-ui";

const t = (key: string) => key;

describe("sellerEmbeddedTradeRowStatusLabel", () => {
  it("uses chatting-specific label instead of listing selling copy", () => {
    expect(
      sellerEmbeddedTradeRowStatusLabel(t, {
        tradeFlowStatus: "chatting",
        hasBuyerReview: false,
      })
    ).toBe("marketplace_seller_buyer_chat_status_chatting");
  });

  it("delegates non-chatting flows to trade situation copy", () => {
    expect(
      sellerEmbeddedTradeRowStatusLabel(t, {
        tradeFlowStatus: "seller_marked_done",
        hasBuyerReview: false,
      })
    ).toBe("trade_situation_seller_marked_seller");
  });
});
