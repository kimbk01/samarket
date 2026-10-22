/**
 * A4 (docs/audit/messenger-2026-10-22-reaudit-plan.md §4-11) — CallKit 이 통화를 표시하는 iOS 설치에는
 * 통화 일반 알림을 보내지 않는다. voip_apns 를 먼저 보내고, 수신 VoIP 가 실패하면 수신 알림을 대체로 보낸다.
 */
import { beforeEach, describe, expect, it, vi } from "vitest";
import type { NotificationSideEffectPayloadOut } from "@/lib/notifications/publish-notification-side-effect";

const loadActivePushTargets = vi.fn();
const sendApnsToTarget = vi.fn();
const sendVoipApnsToTarget = vi.fn();
const sendFcmToTarget = vi.fn();
const order: string[] = [];

vi.mock("@/lib/push/dispatch/load-active-push-targets", async () => {
  const actual = await vi.importActual<typeof import("@/lib/push/dispatch/load-active-push-targets")>(
    "@/lib/push/dispatch/load-active-push-targets"
  );
  return {
    loadActivePushTargets: (...args: unknown[]) => loadActivePushTargets(...args),
    insertNotificationDelivery: vi.fn(async () => "audit-id"),
    insertNotificationDeliveryDetailed: vi.fn(async () => ({ kind: "inserted", id: "row" })),
    reclaimNotificationDeliveryForRetry: vi.fn(),
    isPermanentPushFailureResponse: actual.isPermanentPushFailureResponse,
  };
});
vi.mock("@/lib/notifications/web-push-user-settings-gate", () => ({
  shouldSendWebPushForUser: vi.fn(async () => true),
}));
vi.mock("@/lib/push/dispatch/fcm-sender", () => ({
  sendFcmToTarget: (...args: unknown[]) => sendFcmToTarget(...args),
}));
vi.mock("@/lib/push/dispatch/apns-sender", () => ({
  sendApnsToTarget: (...args: unknown[]) => sendApnsToTarget(...args),
  sendVoipApnsToTarget: (...args: unknown[]) => sendVoipApnsToTarget(...args),
}));
vi.mock("@/lib/push/dispatch/web-push-sender", () => ({
  isWebPushConfigured: () => false,
  sendWebPushToTarget: vi.fn(),
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

function fakeSvc() {
  const chain: Record<string, unknown> = {};
  for (const m of ["select", "eq", "update", "insert"]) chain[m] = vi.fn(() => chain);
  chain.maybeSingle = vi.fn(async () => ({ data: null, error: null }));
  chain.then = (resolve: (v: unknown) => void) => resolve({ data: null, error: null });
  return { from: vi.fn(() => chain) };
}
vi.mock("@/lib/supabase/try-supabase-server", () => ({
  tryCreateSupabaseServiceClient: () => fakeSvc(),
}));

const target = (id: string, provider: string, deviceId: string, platform = "ios") => ({
  id,
  source: "user_devices",
  push_provider: provider,
  push_token: `token-${id}-abcdefg`,
  device_id: deviceId,
  platform,
});

const out: NotificationSideEffectPayloadOut = {
  user_id: "callee",
  notification_type: "community_messenger_incoming_call",
  title: "음성 통화",
  body: "q님의 전화",
  link_url: null,
  link_url_absolute: null,
  occurred_at: new Date().toISOString(),
  meta: { session_id: "s1" },
};

async function run(kind: "incoming_call" | "call_canceled" | "missed_call") {
  const { dispatchPushForUser } = await import("@/lib/push/dispatch/dispatch-push-for-user");
  return dispatchPushForUser(out, {
    target_type: "call_session",
    target_id: "s1",
    call_push_kind: kind,
    skip_settings_gate: true,
  });
}

describe("A4 — iOS call alert suppressed where CallKit shows the call", () => {
  beforeEach(() => {
    process.env.PUSH_DISPATCH_ENABLED = "1";
    order.length = 0;
    // apns row first (as last_seen_at ordering may return it) — dispatch must still send VoIP first.
    loadActivePushTargets
      .mockReset()
      .mockResolvedValue([target("row-apns", "apns", "ios-a"), target("row-voip", "voip_apns", "ios-a")]);
    sendApnsToTarget.mockReset().mockImplementation(async () => {
      order.push("apns");
      return { status: "sent", provider_response: {} };
    });
    sendVoipApnsToTarget.mockReset().mockImplementation(async () => {
      order.push("voip");
      return { status: "sent", provider_response: {} };
    });
    sendFcmToTarget.mockReset().mockResolvedValue({ status: "sent", provider_response: {} });
  });

  it("incoming: VoIP sent first, same-install alert skipped", async () => {
    const r = await run("incoming_call");
    expect(order).toEqual(["voip"]);
    expect(sendApnsToTarget).not.toHaveBeenCalled();
    expect(r.deliveries.find((d) => d.push_provider === "apns")?.provider_response).toMatchObject({
      reason: "ios_call_alert_callkit_owned",
    });
  });

  it("incoming: VoIP failed → incoming alert sent as fallback", async () => {
    sendVoipApnsToTarget.mockImplementation(async () => {
      order.push("voip");
      return { status: "failed", provider_response: {} };
    });
    await run("incoming_call");
    expect(order).toEqual(["voip", "apns"]);
  });

  it("cancel: no alert on the VoIP install", async () => {
    await run("call_canceled");
    expect(sendApnsToTarget).not.toHaveBeenCalled();
  });

  it("missed: alert kept", async () => {
    await run("missed_call");
    expect(sendApnsToTarget).toHaveBeenCalledTimes(1);
  });

  it("iOS install without VoIP (iPad / old install) still gets the incoming alert", async () => {
    loadActivePushTargets.mockResolvedValue([
      target("row-voip", "voip_apns", "ios-a"),
      target("row-ipad", "apns", "ipad-b"),
    ]);
    await run("incoming_call");
    expect(order).toEqual(["voip", "apns"]);
  });
});
