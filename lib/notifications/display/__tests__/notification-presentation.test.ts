import { describe, expect, it } from "vitest";
import {
  isCallPresentationExcluded,
  notificationPresentationWireFields,
  resolveNotificationPresentation,
} from "@/lib/notifications/display/notification-presentation";
import { buildFcmDataFields } from "@/lib/push/dispatch/fcm-data-payload-contract";
import { buildApnsAlertBody } from "@/lib/push/dispatch/apns-sender-impl";
import type { NotificationSideEffectPayloadOut } from "@/lib/notifications/publish-notification-side-effect";

const AVATAR = "https://cdn.example.com/a.jpg";
const STORE = "https://cdn.example.com/s.jpg";

function out(partial: Partial<NotificationSideEffectPayloadOut>): NotificationSideEffectPayloadOut {
  return {
    user_id: "u1",
    notification_type: "system",
    title: "t",
    body: "b",
    link_url: null,
    link_url_absolute: null,
    occurred_at: "2026-10-29T01:00:00.000Z",
    meta: null,
    ...partial,
  };
}

describe("알림 표시 SSOT", () => {
  it("1:1 메시지 → 사람 사진(원) · 대화방 묶음", () => {
    const p = resolveNotificationPresentation(
      out({ notification_type: "chat", title: "q테스트1", meta: { room_id: "r1", sender_avatar_url: AVATAR } })
    );
    expect(p).toMatchObject({ kind: "message", imageUrl: AVATAR, imageShape: "circle", threadKey: "room:r1", bodyTone: "normal" });
  });

  it("주문 → 매장 사진(사각) · 주문 묶음", () => {
    const p = resolveNotificationPresentation(
      out({ notification_type: "commerce", meta: { kind: "store_order_status_buyer", order_id: "o1", store_image_url: STORE } })
    );
    expect(p).toMatchObject({ kind: "order", imageUrl: STORE, imageShape: "rounded", threadKey: "order:o1" });
  });

  it("알림 행 → 푸시 경로(legacyMeta 안의 매장 사진·주문 id)도 주문으로 그린다 — 실기 2026-10-29", () => {
    const p = resolveNotificationPresentation(
      out({
        notification_type: "system",
        meta: {
          event_type: "order_status",
          kind: "store_order_owner_status",
          display_payload: {
            legacyMeta: { kind: "store_order_owner_status", order_id: "o9", store_image_url: STORE },
          },
        },
      })
    );
    expect(p).toMatchObject({ kind: "order", imageUrl: STORE, imageShape: "rounded", threadKey: "order:o9" });
  });

  it("포인트 충전(legacy commerce) → 시스템 · 로고", () => {
    const p = resolveNotificationPresentation(
      out({ notification_type: "commerce", meta: { kind: "user_point_charge_approved" } })
    );
    expect(p).toMatchObject({ kind: "system", imageUrl: null, imageShape: "rounded", threadKey: "system" });
  });

  it("http 사진은 쓰지 않는다", () => {
    const p = resolveNotificationPresentation(
      out({ notification_type: "chat", meta: { room_id: "r1", sender_avatar_url: "http://x/a.jpg" } })
    );
    expect(p.imageUrl).toBeNull();
  });

  it("통화 알림은 SSOT 대상 아님", () => {
    expect(isCallPresentationExcluded({ notification_type: "community_messenger_missed_call" })).toBe(true);
    expect(isCallPresentationExcluded({ notification_type: "chat" })).toBe(false);
  });

  it("FCM data 에 표시 필드가 실린다 (일반 알림)", () => {
    const fields = buildFcmDataFields(
      out({ notification_type: "chat", meta: { room_id: "r1", sender_avatar_url: AVATAR } }),
      undefined,
      {}
    );
    expect(fields).toMatchObject({ presKind: "message", presImageUrl: AVATAR, presImageShape: "circle", presThreadKey: "room:r1" });
  });

  it("통화 FCM data 에는 표시 필드가 없다", () => {
    const fields = buildFcmDataFields(
      out({ notification_type: "community_messenger_missed_call", meta: { session_id: "c1", room_id: "r1" } }),
      undefined,
      {}
    );
    expect(fields.presKind).toBeUndefined();
    expect(fields.presThreadKey).toBeUndefined();
  });

  it("APNs: 같은 묶음 키 → thread-id, 메시지 사진 → mutable-content", () => {
    const p = resolveNotificationPresentation(
      out({ notification_type: "chat", meta: { room_id: "r1", sender_avatar_url: AVATAR } })
    );
    const body = buildApnsAlertBody({ title: "t", body: "b", data: notificationPresentationWireFields(p) });
    const aps = body.aps as Record<string, unknown>;
    expect(aps["thread-id"]).toBe("room:r1");
    expect(aps["mutable-content"]).toBe(1);
  });

  it("APNs: 표시 필드가 없으면(통화) thread-id 없음", () => {
    const body = buildApnsAlertBody({ title: "t", body: "b", data: { type: "missed_call" } });
    const aps = body.aps as Record<string, unknown>;
    expect(aps["thread-id"]).toBeUndefined();
    expect(aps["mutable-content"]).toBeUndefined();
  });
});
