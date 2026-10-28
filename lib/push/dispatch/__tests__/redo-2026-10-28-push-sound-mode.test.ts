/**
 * 재감사 2026-10-28 D-Q3 — 알림음·진동 끔을 일반 알림 푸시에 싣는다.
 * 통화 푸시(수신·부재중·종료 신호) payload 는 바뀌지 않아야 한다.
 */
import { describe, expect, it } from "vitest";
import type { NotificationSideEffectPayloadOut } from "@/lib/notifications/publish-notification-side-effect";
import { buildApnsAlertBody } from "@/lib/push/dispatch/apns-sender-impl";
import { buildWebPushJsonPayload } from "@/lib/push/dispatch/build-web-push-json-payload";
import { resolvePushSoundMode, withPushSoundMode } from "@/lib/push/dispatch/push-sound-mode";

function out(partial: Partial<NotificationSideEffectPayloadOut> = {}): NotificationSideEffectPayloadOut {
  return {
    user_id: "user-1",
    notification_type: "chat",
    title: "Title",
    body: "Body",
    link_url: "/community-messenger/rooms/room-1",
    link_url_absolute: null,
    occurred_at: "2026-10-28T00:00:00.000Z",
    meta: { kind: "trade_chat" },
    ...partial,
  };
}

describe("resolvePushSoundMode", () => {
  it("maps resolver output to 3 combinations", () => {
    expect(resolvePushSoundMode({ playSound: true, vibrate: true })).toBeNull();
    expect(resolvePushSoundMode({ playSound: true, vibrate: false })).toBe("no_vibrate");
    expect(resolvePushSoundMode({ playSound: false, vibrate: false })).toBe("silent");
    expect(resolvePushSoundMode(null)).toBeNull();
  });
});

describe("FCM data soundMode", () => {
  it("general notification carries soundMode", () => {
    expect(buildWebPushJsonPayload(withPushSoundMode(out(), "silent")).data.soundMode).toBe("silent");
    expect(buildWebPushJsonPayload(withPushSoundMode(out(), "no_vibrate")).data.soundMode).toBe("no_vibrate");
  });

  it("no mode → no soundMode key (기존 payload 그대로)", () => {
    expect("soundMode" in buildWebPushJsonPayload(out()).data).toBe(false);
  });

  it("incoming call never carries soundMode even if meta has it", () => {
    const callOut = out({
      notification_type: "community_messenger_incoming_call",
      meta: { session_id: "s-1", kind: "voice" },
    });
    const base = buildWebPushJsonPayload(callOut, { call_push_kind: "incoming_call" });
    const forced = buildWebPushJsonPayload(withPushSoundMode(callOut, "silent"), {
      call_push_kind: "incoming_call",
    });
    expect("soundMode" in forced.data).toBe(false);
    // sentAt 은 생성 시각이라 비교에서 뺀다.
    const strip = (d: Record<string, unknown>) => ({ ...d, sentAt: null });
    expect(strip(forced.data)).toEqual(strip(base.data));
  });

  it("missed call / terminal dismiss never carry soundMode", () => {
    const missed = out({
      notification_type: "community_messenger_missed_call",
      meta: { session_id: "s-2" },
    });
    expect("soundMode" in buildWebPushJsonPayload(withPushSoundMode(missed, "silent"), { call_push_kind: "missed_call" }).data).toBe(false);
    const ended = out({ meta: { session_id: "s-3" } });
    expect("soundMode" in buildWebPushJsonPayload(withPushSoundMode(ended, "silent"), { call_push_kind: "call_ended" }).data).toBe(false);
  });
});

describe("APNs aps.sound", () => {
  it("silent omits aps.sound; default and no_vibrate keep it", () => {
    const silent = buildApnsAlertBody({ title: "t", body: "b", data: buildWebPushJsonPayload(withPushSoundMode(out(), "silent")).data });
    expect("sound" in (silent.aps as Record<string, unknown>)).toBe(false);
    const noVib = buildApnsAlertBody({ title: "t", body: "b", data: buildWebPushJsonPayload(withPushSoundMode(out(), "no_vibrate")).data });
    expect((noVib.aps as Record<string, unknown>).sound).toBe("default");
    const plain = buildApnsAlertBody({ title: "t", body: "b", data: buildWebPushJsonPayload(out()).data });
    expect((plain.aps as Record<string, unknown>).sound).toBe("default");
  });

  it("missed call alert keeps aps.sound default", () => {
    const missed = out({ notification_type: "community_messenger_missed_call", meta: { session_id: "s-2" } });
    const body = buildApnsAlertBody({
      title: "t",
      body: "b",
      data: buildWebPushJsonPayload(withPushSoundMode(missed, "silent"), { call_push_kind: "missed_call" }).data,
    });
    expect((body.aps as Record<string, unknown>).sound).toBe("default");
  });
});
