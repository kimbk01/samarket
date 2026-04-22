import { describe, expect, it } from "vitest";
import {
  TRADE_HUB_COMPLETED_LIST_GRACE_MS,
  ingestProductChatCompletionRow,
  isWinningSoldTradePost,
  shouldOmitTradeRoomFromChatHubList,
  tradeHubListCompletionAnchorMs,
  tradeHubTripleKey,
} from "@/lib/chats/trade-hub-completed-list-expiry";

describe("trade-hub-completed-list-expiry", () => {
  it("tradeHubTripleKey", () => {
    expect(tradeHubTripleKey("p1", "b1", "s1")).toBe("p1:b1:s1");
    expect(tradeHubTripleKey("", "b1", "s1")).toBeNull();
  });

  it("isWinningSoldTradePost", () => {
    expect(isWinningSoldTradePost(undefined, "b1")).toBe(false);
    expect(isWinningSoldTradePost({ status: "active", sold_buyer_id: "b1" }, "b1")).toBe(false);
    expect(isWinningSoldTradePost({ status: "sold", sold_buyer_id: "b1" }, "b1")).toBe(true);
    expect(isWinningSoldTradePost({ status: "sold", sold_buyer_id: "b2" }, "b1")).toBe(false);
  });

  it("tradeHubListCompletionAnchorMs uses later of seller/buyer", () => {
    const t0 = "2026-01-01T10:00:00.000Z";
    const t1 = "2026-01-01T12:00:00.000Z";
    expect(tradeHubListCompletionAnchorMs({ sellerCompletedAt: t0, buyerConfirmedAt: null })).toBe(Date.parse(t0));
    expect(tradeHubListCompletionAnchorMs({ sellerCompletedAt: t0, buyerConfirmedAt: t1 })).toBe(Date.parse(t1));
  });

  it("shouldOmit after grace from completion anchor", () => {
    const anchor = Date.parse("2026-01-01T00:00:00.000Z");
    const post = { status: "sold", sold_buyer_id: "buyer-1" } as Record<string, unknown>;
    const postMap = new Map<string, Record<string, unknown>>([["post-1", post]]);
    const completion = new Map();
    completion.set("post-1:buyer-1:seller-1", {
      sellerCompletedAt: new Date(anchor).toISOString(),
      buyerConfirmedAt: null,
    });
    const room = {
      generalChat: undefined,
      productId: "post-1",
      buyerId: "buyer-1",
      sellerId: "seller-1",
    };
    expect(
      shouldOmitTradeRoomFromChatHubList({
        room,
        postByProductId: postMap,
        completionByTriple: completion,
        nowMs: anchor + TRADE_HUB_COMPLETED_LIST_GRACE_MS - 1,
      })
    ).toBe(false);
    expect(
      shouldOmitTradeRoomFromChatHubList({
        room,
        postByProductId: postMap,
        completionByTriple: completion,
        nowMs: anchor + TRADE_HUB_COMPLETED_LIST_GRACE_MS + 1,
      })
    ).toBe(true);
  });

  it("ingestProductChatCompletionRow merges later timestamps", () => {
    const m = new Map();
    ingestProductChatCompletionRow(m, {
      post_id: "p",
      buyer_id: "b",
      seller_id: "s",
      seller_completed_at: "2026-01-01T01:00:00.000Z",
      buyer_confirmed_at: null,
    });
    ingestProductChatCompletionRow(m, {
      post_id: "p",
      buyer_id: "b",
      seller_id: "s",
      seller_completed_at: "2026-01-02T01:00:00.000Z",
      buyer_confirmed_at: "2026-01-01T12:00:00.000Z",
    });
    const v = m.get("p:b:s");
    expect(v?.sellerCompletedAt).toBe("2026-01-02T01:00:00.000Z");
    expect(v?.buyerConfirmedAt).toBe("2026-01-01T12:00:00.000Z");
  });
});
