import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { readOrderChat } from "@/lib/order-domain/read-order-chat";

const src = readFileSync(join(process.cwd(), "lib/order-domain/read-order-chat.ts"), "utf8");

describe("OrderDomain.readOrderChat contract", () => {
  it("exports the Order Domain read API", () => {
    expect(typeof readOrderChat).toBe("function");
  });

  it("owns order chat read state across participant, targets, and events", () => {
    expect(src).toContain("participantUnreadAfter");
    expect(src).toContain("targetUnreadAfter");
    expect(src).toContain("eventUnreadAfter");
    expect(src).toContain("participantUnreadAfter !== 0 || targetUnreadAfter !== 0 || eventUnreadAfter !== 0");
  });

  it("clears only order chat target keys for owner/customer roles", () => {
    expect(src).toContain('targetType: "owner_order_chat"');
    expect(src).toContain('targetType: "buyer_order"');
    expect(src).not.toContain('targetType: "chat_room"');
    expect(src).not.toContain('targetType: "trade"');
  });

  it("marks only store_order_message events for the order room", () => {
    expect(src).toContain('.eq("type", "store_order_message")');
    expect(src).toContain("room_id.eq.");
    expect(src).not.toContain("requestMessengerHubBadgeResync");
    expect(src).not.toContain("postNotificationRoomRead");
  });
});
