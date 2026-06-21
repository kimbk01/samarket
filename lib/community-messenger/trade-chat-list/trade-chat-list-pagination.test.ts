import { describe, expect, it } from "vitest";
import {
  nextTradeChatListVisibleCount,
  sliceTradeChatListPage,
  tradeChatListHasMorePages,
  TRADE_CHAT_LIST_PAGE_SIZE,
} from "@/lib/community-messenger/trade-chat-list/trade-chat-list-pagination";

describe("trade-chat-list-pagination", () => {
  it("slices visible page", () => {
    const items = [1, 2, 3, 4, 5];
    expect(sliceTradeChatListPage(items, 3)).toEqual([1, 2, 3]);
  });

  it("detects hasMore", () => {
    expect(tradeChatListHasMorePages(20, 15)).toBe(true);
    expect(tradeChatListHasMorePages(10, 15)).toBe(false);
  });

  it("advances visible count by page size", () => {
    expect(nextTradeChatListVisibleCount(15, 40, TRADE_CHAT_LIST_PAGE_SIZE)).toBe(30);
    expect(nextTradeChatListVisibleCount(30, 40, TRADE_CHAT_LIST_PAGE_SIZE)).toBe(40);
  });
});
