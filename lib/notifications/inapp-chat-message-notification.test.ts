import { describe, expect, it } from "vitest";
import { isInAppChatMessageNotificationRow } from "@/lib/notifications/inapp-chat-message-notification";

describe("isInAppChatMessageNotificationRow", () => {
  it("notification_type chat 이면 true", () => {
    expect(isInAppChatMessageNotificationRow({ notification_type: "chat" })).toBe(true);
  });

  it("push_kind chat 이면 true", () => {
    expect(
      isInAppChatMessageNotificationRow({ notification_type: "system", push_kind: "chat" })
    ).toBe(true);
  });

  it("meta.kind 가 메시지 파이프라인이면 true (타입이 chat 아니어도)", () => {
    expect(
      isInAppChatMessageNotificationRow({
        notification_type: "system",
        meta: { kind: "trade_chat" },
      })
    ).toBe(true);
    expect(
      isInAppChatMessageNotificationRow({
        notification_type: "chat",
        meta: { kind: "community_chat" },
      })
    ).toBe(true);
  });

  it("친구 요청(system + friend_request) 은 false", () => {
    expect(
      isInAppChatMessageNotificationRow({
        notification_type: "system",
        meta: { kind: "friend_request" },
      })
    ).toBe(false);
  });
});
