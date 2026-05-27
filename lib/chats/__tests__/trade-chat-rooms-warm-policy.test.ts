import { describe, expect, it } from "vitest";
import { shouldPreloadTradeChatRoomsOnClient } from "@/lib/chats/trade-chat-rooms-warm-policy";

describe("shouldPreloadTradeChatRoomsOnClient", () => {
  it("blocks on /stores hub and delivery consumer surfaces", () => {
    expect(shouldPreloadTradeChatRoomsOnClient("/stores")).toBe(false);
    expect(shouldPreloadTradeChatRoomsOnClient("/stores/browse/restaurant")).toBe(false);
    expect(shouldPreloadTradeChatRoomsOnClient("/stores/cart")).toBe(false);
    expect(shouldPreloadTradeChatRoomsOnClient("/orders")).toBe(false);
  });

  it("allows trade shell surfaces", () => {
    expect(shouldPreloadTradeChatRoomsOnClient("/market")).toBe(true);
    expect(shouldPreloadTradeChatRoomsOnClient("/mypage/purchases")).toBe(true);
  });
});
