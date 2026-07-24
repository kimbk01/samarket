import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

const messagesRoute = readFileSync(
  join(process.cwd(), "app/api/chat/rooms/[roomId]/messages/route.ts"),
  "utf8"
);
const startCore = readFileSync(
  join(process.cwd(), "lib/trade/item-trade-chat-start-core.ts"),
  "utf8"
);

describe("trade legacy message → Domain trade target bump contract", () => {
  it("bumps trade notification_targets via CM messenger room after legacy POST", () => {
    expect(messagesRoute).toContain("bumpTradeTargetForMessengerRoomRecipients");
    expect(messagesRoute).toContain("community_messenger_room_id");
    expect(messagesRoute).toContain('roomKind: "trade_legacy"');
  });

  it("clears product_chats left_at on item/start reopen", () => {
    expect(startCore).toContain("buyer_left_at: null");
    expect(startCore).toContain("seller_left_at: null");
    expect(startCore).toContain("trade_sender_left");
  });
});
