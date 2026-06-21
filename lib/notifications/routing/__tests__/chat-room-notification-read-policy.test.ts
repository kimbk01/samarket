import { describe, expect, it } from "vitest";
import { isNotificationReadDeferredChatRoomPath } from "@/lib/notifications/routing/chat-room-notification-read-policy";

describe("chat room notification read policy", () => {
  it("defers notification_events read for chat room routes until room UI is visible", () => {
    expect(isNotificationReadDeferredChatRoomPath("/community-messenger/rooms/room-1")).toBe(true);
    expect(isNotificationReadDeferredChatRoomPath("/community-messenger/rooms/room-1?from=push")).toBe(true);
    expect(isNotificationReadDeferredChatRoomPath("/chats/trade-room-1")).toBe(true);
  });

  it("does not defer non-chat notification surfaces", () => {
    expect(isNotificationReadDeferredChatRoomPath("/community-messenger")).toBe(false);
    expect(isNotificationReadDeferredChatRoomPath("/calls/logs")).toBe(false);
    expect(isNotificationReadDeferredChatRoomPath("/stores/orders/order-1")).toBe(false);
  });
});
