import { describe, expect, it } from "vitest";
import {
  buildDomainListHubRoute,
  buildDomainPushEnvelope,
  buildDomainRoomRoute,
  soundEventKeyForChatDomain,
} from "@/lib/chat-domain/push";

describe("Phase G domain push/sound/route", () => {
  it("builds room routes for all four domains", () => {
    expect(buildDomainRoomRoute({ chatDomain: "general_direct", roomId: "r1" })).toBe(
      "/community-messenger/rooms/r1",
    );
    expect(buildDomainRoomRoute({ chatDomain: "group", roomId: "r1" })).toBe(
      "/community-messenger/rooms/r1",
    );
    expect(buildDomainRoomRoute({ chatDomain: "trade", roomId: "r 1" })).toBe(
      "/community-messenger/rooms/r%201",
    );
    expect(buildDomainRoomRoute({ chatDomain: "store_order", roomId: "r1" })).toBe(
      "/community-messenger/rooms/r1",
    );
    expect(buildDomainRoomRoute({ chatDomain: "trade", roomId: "  " })).toBeNull();
  });

  it("maps ChatDomain to existing sound event keys", () => {
    expect(soundEventKeyForChatDomain("general_direct")).toBe("messenger_direct_message_received");
    expect(soundEventKeyForChatDomain("group")).toBe("messenger_group_message_received");
    expect(soundEventKeyForChatDomain("trade")).toBe("trade_chat_message_received");
    expect(soundEventKeyForChatDomain("store_order")).toBe("delivery_chat_message_received_user");
    expect(soundEventKeyForChatDomain("store_order", { storeOrderRole: "owner" })).toBe(
      "delivery_chat_message_received_owner",
    );
  });

  it("builds push envelope with route + sound", () => {
    const env = buildDomainPushEnvelope({
      chatDomain: "trade",
      domainIdentity: "trade:item:a:b",
      roomId: "room-9",
    });
    expect(env).toMatchObject({
      chatDomain: "trade",
      domainIdentity: "trade:item:a:b",
      roomId: "room-9",
      routeUrl: "/community-messenger/rooms/room-9",
      soundEventKey: "trade_chat_message_received",
    });
  });

  it("list hub routes stay domain-separated", () => {
    expect(buildDomainListHubRoute("trade")).toBe("/community-messenger/trade-chats");
    expect(buildDomainListHubRoute("store_order")).toBe("/community-messenger/delivery-chats");
  });
});
