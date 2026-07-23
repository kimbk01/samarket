import { describe, expect, it } from "vitest";
import {
  MESSENGER_CHAT_ROOM_UNREAD_TARGET_TYPE,
  buildMessengerChatRoomUnreadTargetRoomIds,
  resolveMessengerChatRoomListUnreadCount,
} from "@/lib/messenger/contracts/chat-room-unread-from-notification-targets";

describe("messenger chat_room unread from notification_targets", () => {
  it("uses chat_room target type (hub-bundle axis)", () => {
    expect(MESSENGER_CHAT_ROOM_UNREAD_TARGET_TYPE).toBe("chat_room");
  });

  describe("general_direct / group match key = roomId (target_id)", () => {
    it("zeros stale participant unread when room has no chat_room target", () => {
      const targets = new Set(["room-alive"]);
      expect(
        resolveMessengerChatRoomListUnreadCount({
          roomId: "d3867e4c-stale",
          unreadTargetRoomIds: targets,
          participantUnreadCount: 20,
        })
      ).toBe(0);
    });

    it("keeps message magnitude when target present", () => {
      const targets = new Set(["room-alive"]);
      expect(
        resolveMessengerChatRoomListUnreadCount({
          roomId: "room-alive",
          unreadTargetRoomIds: targets,
          participantUnreadCount: 20,
        })
      ).toBe(20);
      expect(
        resolveMessengerChatRoomListUnreadCount({
          roomId: "room-alive",
          unreadTargetRoomIds: targets,
          participantUnreadCount: 0,
        })
      ).toBe(1);
    });

    it("does not treat orderId-shaped ids as room matches", () => {
      const orderId = "b24dbb99-2c25-41d1-882b-b5078a824b7a";
      const targets = new Set([orderId]);
      expect(
        resolveMessengerChatRoomListUnreadCount({
          roomId: "room-abc",
          unreadTargetRoomIds: targets,
          participantUnreadCount: 5,
        })
      ).toBe(0);
    });
  });

  it("buildMessengerChatRoomUnreadTargetRoomIds filters domain + type", () => {
    const ids = buildMessengerChatRoomUnreadTargetRoomIds(
      [
        { target_id: "gd-1", chat_domain: "general_direct", target_type: "chat_room", is_unread: true },
        { target_id: "grp-1", chat_domain: "group", target_type: "chat_room", is_unread: true },
        { target_id: "trade-1", chat_domain: "trade", target_type: "trade", is_unread: true },
        { target_id: "gd-read", chat_domain: "general_direct", target_type: "chat_room", is_unread: false },
      ],
      ["general_direct"]
    );
    expect([...ids]).toEqual(["gd-1"]);
  });
});
