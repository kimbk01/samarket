import { describe, expect, it } from "vitest";
import { isWeakTradeChatListTitle } from "@/lib/community-messenger/trade-chat-list/use-trade-chat-list-post-preview-fields";

describe("isWeakTradeChatListTitle", () => {
  it("treats empty and 거래 as weak", () => {
    expect(isWeakTradeChatListTitle("")).toBe(true);
    expect(isWeakTradeChatListTitle("거래")).toBe(true);
    expect(isWeakTradeChatListTitle("  거래  ")).toBe(true);
  });

  it("accepts real titles", () => {
    expect(isWeakTradeChatListTitle("중고차 판매")).toBe(false);
  });
});
