/**
 * 재감사 2026-10-28 D-Q3 — dispatchPushForUser 가 게이트 결정을 일반 알림에만 싣는지.
 */
import { beforeEach, describe, expect, it, vi } from "vitest";
import type { NotificationSideEffectPayloadOut } from "@/lib/notifications/publish-notification-side-effect";

const loadActivePushTargets = vi.fn();
const sendFcmToTarget = vi.fn();
const gateDecision = { current: { sendPush: true, playSound: false, vibrate: false } };

vi.mock("@/lib/push/dispatch/load-active-push-targets", () => ({
  loadActivePushTargets: (...args: unknown[]) => loadActivePushTargets(...args),
  insertNotificationDelivery: vi.fn(async () => undefined),
  insertNotificationDeliveryDetailed: vi.fn(async () => ({ kind: "conflict" })),
  reclaimNotificationDeliveryForRetry: vi.fn(async () => ({ kind: "already_sent" })),
  isPermanentPushFailureResponse: () => false,
}));
vi.mock("@/lib/notifications/web-push-user-settings-gate", () => ({
  shouldSendWebPushForUser: vi.fn(
    async (
      _svc: unknown,
      _uid: unknown,
      _out: unknown,
      options?: { onDecision?: (d: typeof gateDecision.current) => void }
    ) => {
      options?.onDecision?.(gateDecision.current);
      return gateDecision.current.sendPush;
    }
  ),
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
  tryCreateSupabaseServiceClient: () => ({
    from: vi.fn(() => ({
      select: vi.fn().mockReturnThis(),
      eq: vi.fn().mockReturnThis(),
      maybeSingle: vi.fn().mockResolvedValue({ data: null, error: null }),
      insert: vi.fn().mockResolvedValue({ data: null, error: null }),
    })),
  }),
}));
vi.mock("@/lib/notifications/notification-sound-ssot-server-hydrate", () => ({
  ensureNotificationSoundSsotHydratedForServer: vi.fn(async () => undefined),
}));
vi.mock("@/lib/push/dispatch/push-sound-ssot-enrichment", () => ({
  enrichPushPayloadWithSoundSsotMeta: (o: NotificationSideEffectPayloadOut) => o,
}));
vi.mock("@/lib/push/dispatch/notification-delivery-safety-gate", () => ({
  evaluateNotificationDeliverySafety: vi.fn(async () => ({ allow: true })),
}));
vi.mock("@/lib/push/dispatch/deactivate-failed-token", () => ({
  deactivateFailedPushTarget: vi.fn(),
}));

function payload(partial: Partial<NotificationSideEffectPayloadOut> = {}): NotificationSideEffectPayloadOut {
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

function sentMeta(): Record<string, unknown> | null {
  const sent = sendFcmToTarget.mock.calls[0]?.[1] as NotificationSideEffectPayloadOut | undefined;
  return (sent?.meta as Record<string, unknown> | null) ?? null;
}

describe("dispatchPushForUser push_sound_mode", () => {
  beforeEach(() => {
    process.env.PUSH_DISPATCH_ENABLED = "1";
    sendFcmToTarget.mockReset();
    sendFcmToTarget.mockResolvedValue({ status: "sent", provider_response: {} });
    loadActivePushTargets.mockReset();
    loadActivePushTargets.mockResolvedValue([
      { id: "dev-1", source: "user_devices", push_provider: "fcm", push_token: "token-abcdefg", device_id: "device-1", platform: "android" },
    ]);
  });

  it("general notification + sound off → meta push_sound_mode silent + delivery audit", async () => {
    gateDecision.current = { sendPush: true, playSound: false, vibrate: false };
    const { dispatchPushForUser } = await import("@/lib/push/dispatch/dispatch-push-for-user");
    const r = await dispatchPushForUser(payload(), {});
    expect(sentMeta()?.push_sound_mode).toBe("silent");
    expect(r.deliveries[0]?.provider_response?.push_sound_mode).toBe("silent");
  });

  it("vibrate off only → no_vibrate", async () => {
    gateDecision.current = { sendPush: true, playSound: true, vibrate: false };
    const { dispatchPushForUser } = await import("@/lib/push/dispatch/dispatch-push-for-user");
    await dispatchPushForUser(payload(), {});
    expect(sentMeta()?.push_sound_mode).toBe("no_vibrate");
  });

  it("all on → payload unchanged", async () => {
    gateDecision.current = { sendPush: true, playSound: true, vibrate: true };
    const { dispatchPushForUser } = await import("@/lib/push/dispatch/dispatch-push-for-user");
    const r = await dispatchPushForUser(payload(), {});
    expect(sentMeta()).toEqual({ kind: "trade_chat" });
    expect(r.deliveries[0]?.provider_response && "push_sound_mode" in r.deliveries[0].provider_response).toBe(false);
  });

  it("missed call push (gate runs) → no push_sound_mode", async () => {
    gateDecision.current = { sendPush: true, playSound: false, vibrate: false };
    const { dispatchPushForUser } = await import("@/lib/push/dispatch/dispatch-push-for-user");
    await dispatchPushForUser(
      payload({ notification_type: "community_messenger_missed_call", meta: { session_id: "s-1" } }),
      { call_push_kind: "missed_call" }
    );
    expect(sentMeta()).toEqual({ session_id: "s-1" });
  });
});
