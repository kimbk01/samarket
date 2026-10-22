/**
 * 통화 복구 계획 §8-4 — call_answered_elsewhere 는 받은 기기 자신에게 보내지 않는다(iOS VoIP 폐기 방지).
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

const WINNER = "iphone-winner";
const OTHER = "ipad-other";

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

describe("통화 복구 §8-4 — 다른 기기에서 받음 푸시는 받은 기기 제외", () => {
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

  it("받은 iPhone(VoIP·알림 행) 제외 · 다른 기기에는 발송", async () => {
    loadActivePushTargets.mockResolvedValue([
      target("w-voip", "voip_apns", WINNER),
      target("w-alert", "apns", WINNER),
      target("o-voip", "voip_apns", OTHER),
      target("o-android", "fcm", "android-other"),
    ]);
    const { sendWebPushForCommunityMessengerCallAnsweredElsewhere } = await import(
      "@/lib/push/send-community-messenger-call-answered-elsewhere-push"
    );
    await sendWebPushForCommunityMessengerCallAnsweredElsewhere({
      recipientUserId: "user-1",
      sessionId: "s1",
      answeredDeviceId: WINNER,
    });
    const voipIds = sendVoipApnsToTarget.mock.calls.map((c) => (c[0] as { id: string }).id);
    const alertIds = sendApnsToTarget.mock.calls.map((c) => (c[0] as { id: string }).id);
    expect(voipIds).toEqual(["o-voip"]);
    expect(alertIds).toEqual([]);
    expect(sendFcmToTarget).toHaveBeenCalledTimes(1);
  });

  it("받은 기기 ID 가 없으면 기존대로 전체 발송", async () => {
    loadActivePushTargets.mockResolvedValue([target("w-voip", "voip_apns", WINNER), target("o-voip", "voip_apns", OTHER)]);
    const { sendWebPushForCommunityMessengerCallAnsweredElsewhere } = await import(
      "@/lib/push/send-community-messenger-call-answered-elsewhere-push"
    );
    await sendWebPushForCommunityMessengerCallAnsweredElsewhere({
      recipientUserId: "user-1",
      sessionId: "s1",
      answeredDeviceId: null,
    });
    expect(sendVoipApnsToTarget).toHaveBeenCalledTimes(2);
  });

  it("다른 통화 푸시(취소)는 제외 옵션 없이 기존대로", async () => {
    loadActivePushTargets.mockResolvedValue([target("w-voip", "voip_apns", WINNER)]);
    const { dispatchPushForUser } = await import("@/lib/push/dispatch/dispatch-push-for-user");
    await dispatchPushForUser(
      {
        user_id: "user-1",
        notification_type: "community_messenger_call_canceled",
        title: "통화",
        body: "",
        link_url: null,
        link_url_absolute: null,
        occurred_at: new Date().toISOString(),
        meta: { session_id: "s1" },
      },
      { skip_settings_gate: true, call_push_kind: "call_canceled", target_type: "call_session", target_id: "s1" }
    );
    expect(sendVoipApnsToTarget).toHaveBeenCalledTimes(1);
  });
});
