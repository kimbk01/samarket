import { describe, expect, it } from "vitest";
import { isWeakTradeChatListTitle } from "@/lib/community-messenger/trade-chat-list/use-trade-chat-list-post-preview-fields";

describe("isWeakTradeChatListTitle", () => {
  it("treats empty and weak label as weak", () => {
    const weak = "거래";
    expect(isWeakTradeChatListTitle("", weak)).toBe(true);
    expect(isWeakTradeChatListTitle("거래", weak)).toBe(true);
    expect(isWeakTradeChatListTitle("  거래  ", weak)).toBe(true);
  });

  it("accepts real titles", () => {
    expect(isWeakTradeChatListTitle("중고차 판매", "거래")).toBe(false);
  });
});
