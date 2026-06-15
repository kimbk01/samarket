import { describe, expect, it } from "vitest";
import { buildWebPushJsonPayload } from "@/lib/push/dispatch/build-web-push-json-payload";
import type { NotificationSideEffectPayloadOut } from "@/lib/notifications/publish-notification-side-effect";

function baseOut(
  partial: Partial<NotificationSideEffectPayloadOut> & Pick<NotificationSideEffectPayloadOut, "notification_type">
): NotificationSideEffectPayloadOut {
  return {
    user_id: "user-1",
    title: "Title",
    body: "Body",
    link_url: "/",
    link_url_absolute: "https://example.com/",
    occurred_at: "2026-06-15T00:00:00.000Z",
    ...partial,
  };
}

describe("buildWebPushJsonPayload", () => {
  it("adds incoming_call type with legacy fields", () => {
    const payload = buildWebPushJsonPayload(
      baseOut({
        notification_type: "community_messenger_incoming_call",
        link_url: "/community-messenger/calls/sess-1",
        meta: {
          session_id: "sess-1",
          room_id: "room-1",
          caller_id: "caller-1",
          caller_name: "Alice",
          kind: "video",
          started_at: "2026-06-15T00:00:00.000Z",
          expires_at: "2026-06-15T00:00:30.000Z",
        },
      }),
      { call_push_kind: "incoming_call" }
    );

    expect(payload.data.type).toBe("incoming_call");
    expect(payload.data.call_push_kind).toBe("incoming_call");
    expect(payload.data.sessionId).toBe("sess-1");
    expect(payload.data.callId).toBe("sess-1");
    expect(payload.data.roomId).toBe("room-1");
    expect(payload.data.callerId).toBe("caller-1");
    expect(payload.data.callType).toBe("video");
    expect(payload.data.url).toBe("/community-messenger/calls/sess-1");
    expect(payload.data.notificationId).toBeTruthy();
    expect(payload.data.createdAt).toBe("2026-06-15T00:00:00.000Z");
    expect(payload.is_call).toBe(true);
  });

  it("adds missed_call room focus url when room_id present", () => {
    const payload = buildWebPushJsonPayload(
      baseOut({
        notification_type: "community_messenger_missed_call",
        link_url: "/community-messenger/calls/logs?callId=sess-2",
        meta: {
          session_id: "sess-2",
          room_id: "room-2",
          caller_id: "peer-1",
          caller_name: "Bob",
          missed_at: "2026-06-15T00:01:00.000Z",
        },
      }),
      { call_push_kind: "missed_call" }
    );

    expect(payload.data.type).toBe("missed_call");
    expect(payload.data.call_push_kind).toBe("missed_call");
    expect(payload.data.url).toBe(
      "/community-messenger/rooms/room-2?focus=call-history&callId=sess-2"
    );
    expect(payload.is_call).toBe(false);
  });

  it("maps community chat to chat_message", () => {
    const payload = buildWebPushJsonPayload(
      baseOut({
        notification_type: "chat",
        link_url: "/community-messenger/rooms/room-9",
        meta: {
          kind: "community_chat",
          room_id: "room-9",
          message_id: "msg-1",
          sender_id: "sender-1",
        },
      })
    );

    expect(payload.data.type).toBe("chat_message");
    expect(payload.data.roomId).toBe("room-9");
    expect(payload.data.messageId).toBe("msg-1");
    expect(payload.data.url).toBe("/community-messenger/rooms/room-9");
  });
});
