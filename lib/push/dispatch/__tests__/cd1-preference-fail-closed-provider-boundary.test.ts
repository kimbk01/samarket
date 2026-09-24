/**
 * CD-1 — dispatchPushForUser provider-send boundary (T4/T5/T1/T7).
 * Mocks shouldSendWebPushForUser so provider invocation count is measurable.
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
}));

vi.mock("@/lib/notifications/web-push-user-settings-gate", () => ({
  shouldSendWebPushForUser: (...args: unknown[]) => shouldSendWebPushForUserMock(...args),
}));

vi.mock("@/lib/push/dispatch/fcm-sender", () => ({
  sendFcmToTarget: (...args: unknown[]) => sendFcmToTarget(...args),
}));

vi.mock("@/lib/push/dispatch/apns-sender", () => ({
  sendApnsToTarget: vi.fn(),
  sendVoipApnsToTarget: vi.fn(),
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

function payload(
  partial: Partial<NotificationSideEffectPayloadOut> = {}
): NotificationSideEffectPayloadOut {
  return {
    user_id: "user-1",
    notification_type: "chat",
    title: "t",
    body: "b",
    link_url: null,
    link_url_absolute: null,
    occurred_at: new Date().toISOString(),
    meta: { kind: "trade_chat" },
    ...partial,
  };
}

describe("CD-1 dispatchPushForUser provider-send boundary", () => {
  beforeEach(() => {
    loadActivePushTargets.mockReset();
    insertNotificationDelivery.mockReset();
    shouldSendWebPushForUserMock.mockReset();
    sendFcmToTarget.mockReset();
    tryCreateSupabaseServiceClient.mockReset();
    process.env.PUSH_DISPATCH_ENABLED = "1";
    tryCreateSupabaseServiceClient.mockReturnValue({
      from: vi.fn(() => ({
        select: vi.fn().mockReturnThis(),
        eq: vi.fn().mockReturnThis(),
        maybeSingle: vi.fn().mockResolvedValue({ data: null, error: null }),
        insert: vi.fn().mockResolvedValue({ data: null, error: null }),
      })),
    });
    insertNotificationDelivery.mockResolvedValue(undefined);
    loadActivePushTargets.mockResolvedValue([
      {
        id: "dev-1",
        source: "user_devices",
        push_provider: "fcm",
        push_token: "token-abcdefg-xyz",
        device_id: "device-1",
        platform: "android",
      },
    ]);
    sendFcmToTarget.mockResolvedValue({ status: "sent", provider_response: {} });
  });

  it("T4 — gate false → loadActivePushTargets + FCM count 0", async () => {
    shouldSendWebPushForUserMock.mockResolvedValue(false);
    const { dispatchPushForUser } = await import("@/lib/push/dispatch/dispatch-push-for-user");
    const r = await dispatchPushForUser(payload(), {});
    expect(r.ok).toBe(true);
    expect(loadActivePushTargets).toHaveBeenCalledTimes(0);
    expect(sendFcmToTarget).toHaveBeenCalledTimes(0);
  });

  it("T5 — gate reject → outer catch → loadActivePushTargets + FCM count 0", async () => {
    shouldSendWebPushForUserMock.mockRejectedValue(new Error("unexpected_gate_boom"));
    const { dispatchPushForUser } = await import("@/lib/push/dispatch/dispatch-push-for-user");
    const r = await dispatchPushForUser(payload(), {});
    expect(r.ok).toBe(true);
    expect(loadActivePushTargets).toHaveBeenCalledTimes(0);
    expect(sendFcmToTarget).toHaveBeenCalledTimes(0);
  });

  it("T1 — gate allow → FCM send path alive", async () => {
    shouldSendWebPushForUserMock.mockResolvedValue(true);
    const { dispatchPushForUser } = await import("@/lib/push/dispatch/dispatch-push-for-user");
    await dispatchPushForUser(payload(), {});
    expect(loadActivePushTargets).toHaveBeenCalledTimes(1);
    expect(sendFcmToTarget).toHaveBeenCalledTimes(1);
  });

  it("T7 — skip_settings_gate → gate unused; targets still load", async () => {
    shouldSendWebPushForUserMock.mockResolvedValue(false);
    const { dispatchPushForUser } = await import("@/lib/push/dispatch/dispatch-push-for-user");
    await dispatchPushForUser(payload({ notification_type: "community_messenger_incoming_call" }), {
      skip_settings_gate: true,
      call_push_kind: "incoming_call",
    });
    expect(shouldSendWebPushForUserMock).not.toHaveBeenCalled();
    expect(loadActivePushTargets).toHaveBeenCalledTimes(1);
  });
});
