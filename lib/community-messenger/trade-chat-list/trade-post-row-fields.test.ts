import { describe, expect, it } from "vitest";
import {
  tradeChatProductCategoryDisplayName,
  tradePostCategoryId,
  tradePostHeadlineForMessengerList,
} from "@/lib/community-messenger/trade-chat-list/trade-post-row-fields";
import type { TradeChatCategoryMetaLike } from "@/lib/community-messenger/trade-chat-list/category-menu-label";

describe("trade-post-row-fields", () => {
  it("tradePostCategoryId prefers trade_category_id", () => {
    expect(tradePostCategoryId({ trade_category_id: "a", category_id: "b" })).toBe("a");
  });

  it("tradePostHeadlineForMessengerList reads meta listing_title", () => {
    expect(
      tradePostHeadlineForMessengerList({
        title: "",
        meta: { listing_title: "  반려견 용품  " },
      })
    ).toBe("반려견 용품");
  });

  it("tradeChatProductCategoryDisplayName uses category map name", () => {
    const m = new Map<string, TradeChatCategoryMetaLike>();
    m.set("cat-1", { name: "중고차" });
    expect(tradeChatProductCategoryDisplayName({ trade_category_id: "cat-1" }, m)).toBe("중고차");
  });

  it("tradeChatProductCategoryDisplayName returns null when unknown id", () => {
    expect(tradeChatProductCategoryDisplayName({ trade_category_id: "x" }, new Map())).toBeNull();
  });
});
