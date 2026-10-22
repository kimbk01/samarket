/**
 * 통화 복구 계획 §4 — 같은 iPhone 에 VoIP sent 면 통화 일반 알림(apns) 생략, missed_call·VoIP 실패·다른 기기는 발송.
 * 하네스는 cd1-preference-fail-closed-provider-boundary.test.ts 와 동일.
 */
import { beforeEach, describe, expect, it, vi } from "vitest";
import type { NotificationSideEffectPayloadOut } from "@/lib/notifications/publish-notification-side-effect";

const loadActivePushTargets = vi.fn();
const insertNotificationDelivery = vi.fn();
const shouldSendWebPushForUserMock = vi.fn();
const sendFcmToTarget = vi.fn();
const tryCreateSupabaseServiceClient = vi.fn();

vi.mock("@/lib/push/dispatch/load-active-push-targets", () => ({
  loadActivePushTargets: (...args: unknown[]) => loadActivePushTargets(...args),
  insertNotificationDelivery: (...args: unknown[]) => insertNotificationDelivery(...args),
  insertNotificationDeliveryDetailed: async (...args: unknown[]) => {
    const id = await insertNotificationDelivery(...args);
    return id ? { kind: "inserted", id } : { kind: "conflict" };
  },
  reclaimNotificationDeliveryForRetry: vi.fn(async () => ({ kind: "already_sent" })),
  isPermanentPushFailureResponse: () => false,
}));

vi.mock("@/lib/notifications/web-push-user-settings-gate", () => ({
  shouldSendWebPushForUser: (...args: unknown[]) => shouldSendWebPushForUserMock(...args),
}));

vi.mock("@/lib/push/dispatch/fcm-sender", () => ({
  sendFcmToTarget: (...args: unknown[]) => sendFcmToTarget(...args),
}));

const sendApnsToTarget = vi.fn();
const sendVoipApnsToTarget = vi.fn();

vi.mock("@/lib/push/dispatch/apns-sender", () => ({
  sendApnsToTarget: (...args: unknown[]) => sendApnsToTarget(...args),
  sendVoipApnsToTarget: (...args: unknown[]) => sendVoipApnsToTarget(...args),
}));

vi.mock("@/lib/push/dispatch/web-push-sender", () => ({
  isWebPushConfigured: () => false,
  sendWebPushToTarget: vi.fn(),
}));

vi.mock("@/lib/supabase/try-supabase-server", () => ({
  tryCreateSupabaseServiceClient: (...args: unknown[]) => tryCreateSupabaseServiceClient(...args),
}));

vi.mock("@/lib/notifications/notification-sound-ssot-server-hydrate", () => ({
  ensureNotificationSoundSsotHydratedForServer: vi.fn(async () => undefined),
}));

vi.mock("@/lib/push/dispatch/push-sound-ssot-enrichment", () => ({
  enrichPushPayloadWithSoundSsotMeta: (out: NotificationSideEffectPayloadOut) => out,
}));

vi.mock("@/lib/push/dispatch/notification-delivery-safety-gate", () => ({
  evaluateNotificationDeliverySafety: vi.fn(async () => ({ allow: true })),
}));

vi.mock("@/lib/push/dispatch/deactivate-failed-token", () => ({
  deactivateFailedPushTarget: vi.fn(),
}));

const IPHONE = "iphone-device-1";

function target(id: string, provider: "apns" | "voip_apns" | "fcm", deviceId: string | null) {
  return {
    id,
    source: "user_devices",
    push_provider: provider,
    push_token: `${id}-token-abcdefg`,
    device_id: deviceId,
    platform: provider === "fcm" ? "android" : "ios",
  };
}

function callPayload(): NotificationSideEffectPayloadOut {
  return {
    user_id: "user-1",
    notification_type: "community_messenger_incoming_call",
    title: "음성 통화",
    body: "A님의 전화",
    link_url: "/community-messenger/calls/s1",
    link_url_absolute: null,
    occurred_at: new Date().toISOString(),
    meta: { session_id: "s1" },
  };
}

type Kind = "incoming_call" | "missed_call" | "call_canceled" | "call_rejected" | "call_ended" | "call_answered_elsewhere";

async function dispatch(kind: Kind) {
  const { dispatchPushForUser } = await import("@/lib/push/dispatch/dispatch-push-for-user");
  return dispatchPushForUser(callPayload(), {
    skip_settings_gate: true,
    call_push_kind: kind,
    target_type: "call_session",
    target_id: "s1",
  });
}

describe("통화 복구 §4 — VoIP sent 기기의 통화 일반 알림 생략", () => {
  beforeEach(() => {
    loadActivePushTargets.mockReset();
    insertNotificationDelivery.mockReset();
    shouldSendWebPushForUserMock.mockReset();
    sendFcmToTarget.mockReset();
    sendApnsToTarget.mockReset();
    sendVoipApnsToTarget.mockReset();
    tryCreateSupabaseServiceClient.mockReset();
    process.env.PUSH_DISPATCH_ENABLED = "1";
    tryCreateSupabaseServiceClient.mockReturnValue({
      from: vi.fn(() => ({
        select: vi.fn().mockReturnThis(),
        eq: vi.fn().mockReturnThis(),
        update: vi.fn().mockReturnThis(),
        maybeSingle: vi.fn().mockResolvedValue({ data: null, error: null }),
        insert: vi.fn().mockResolvedValue({ data: null, error: null }),
      })),
    });
    insertNotificationDelivery.mockResolvedValue(undefined);
    sendFcmToTarget.mockResolvedValue({ status: "sent", provider_response: {} });
    sendApnsToTarget.mockResolvedValue({ status: "sent", provider_response: {} });
    sendVoipApnsToTarget.mockResolvedValue({ status: "sent", provider_response: {} });
  });

  it.each(["incoming_call", "call_canceled", "call_rejected", "call_ended", "call_answered_elsewhere"] as const)(
    "%s — 알림 행이 먼저 와도 VoIP 먼저 sent → 같은 기기 apns 생략",
    async (kind) => {
      loadActivePushTargets.mockResolvedValue([target("alert", "apns", IPHONE), target("voip", "voip_apns", IPHONE)]);
      const r = await dispatch(kind);
      expect(sendVoipApnsToTarget).toHaveBeenCalledTimes(1);
      expect(sendApnsToTarget).toHaveBeenCalledTimes(0);
      expect(r.deliveries.some((d) => d.status === "skipped" && d.push_provider === "apns")).toBe(true);
    }
  );

  it("missed_call — 부재중 알림은 그대로 발송", async () => {
    loadActivePushTargets.mockResolvedValue([target("alert", "apns", IPHONE), target("voip", "voip_apns", IPHONE)]);
    await dispatch("missed_call");
    expect(sendVoipApnsToTarget).toHaveBeenCalledTimes(1);
    expect(sendApnsToTarget).toHaveBeenCalledTimes(1);
  });

  it("VoIP 실패 → 일반 알림 발송(대체 수단 유지)", async () => {
    sendVoipApnsToTarget.mockResolvedValue({ status: "failed", provider_response: {} });
    loadActivePushTargets.mockResolvedValue([target("alert", "apns", IPHONE), target("voip", "voip_apns", IPHONE)]);
    await dispatch("incoming_call");
    expect(sendApnsToTarget).toHaveBeenCalledTimes(1);
  });

  it("VoIP 없는 iPhone · 다른 기기 · device_id 없는 알림 행은 발송", async () => {
    loadActivePushTargets.mockResolvedValue([
      target("voip", "voip_apns", IPHONE),
      target("other-iphone-alert", "apns", "iphone-device-2"),
      target("no-device-alert", "apns", null),
    ]);
    await dispatch("incoming_call");
    expect(sendApnsToTarget).toHaveBeenCalledTimes(2);
  });

  it("Android FCM 통화 푸시는 영향 없음", async () => {
    loadActivePushTargets.mockResolvedValue([target("android", "fcm", "android-1"), target("voip", "voip_apns", IPHONE)]);
    await dispatch("incoming_call");
    expect(sendFcmToTarget).toHaveBeenCalledTimes(1);
    expect(sendVoipApnsToTarget).toHaveBeenCalledTimes(1);
  });
});
