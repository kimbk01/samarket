import { describe, expect, it } from "vitest";
import { resolveTradeBlockedProductDetailPostId } from "@/lib/community-messenger/room/phase2/trade-blocked-product-detail-cta";

describe("resolveTradeBlockedProductDetailPostId", () => {
  it("returns contextMeta.postId for trade rooms", () => {
    expect(
      resolveTradeBlockedProductDetailPostId({
        contextMetaKind: "trade",
        contextMetaPostId: "post-abc",
        tradeListingPostId: "post-other",
      })
    ).toBe("post-abc");
  });

  it("falls back to listing post id when meta postId missing", () => {
    expect(
      resolveTradeBlockedProductDetailPostId({
        contextMetaKind: "trade",
        contextMetaPostId: "  ",
        tradeListingPostId: "post-list",
      })
    ).toBe("post-list");
  });

  it("returns null for non-trade context", () => {
    expect(
      resolveTradeBlockedProductDetailPostId({
        contextMetaKind: "general",
        contextMetaPostId: "post-abc",
      })
    ).toBeNull();
  });

  it("never treats productChatId as product detail id (caller must not pass room ids)", () => {
    expect(
      resolveTradeBlockedProductDetailPostId({
        contextMetaKind: "trade",
        contextMetaPostId: null,
        tradeListingPostId: null,
      })
    ).toBeNull();
  });
});
