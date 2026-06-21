import { describe, expect, it } from "vitest";
import { formatTradeChatListTimestamp } from "@/lib/community-messenger/trade-chat-list/trade-chat-list-timestamp";

describe("formatTradeChatListTimestamp", () => {
  it("returns HH:mm for same day", () => {
    const now = new Date();
    const iso = new Date(now.getFullYear(), now.getMonth(), now.getDate(), 19, 39).toISOString();
    expect(formatTradeChatListTimestamp(iso)).toBe("19:39");
  });

  it("returns M/D for same year different day", () => {
    const now = new Date();
    const past = new Date(now.getFullYear(), 0, 15, 19, 39);
    expect(formatTradeChatListTimestamp(past.toISOString())).toBe("1/15");
  });
});
