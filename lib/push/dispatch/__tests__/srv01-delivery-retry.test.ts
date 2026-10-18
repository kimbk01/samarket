/**
 * SRV-01 — retry of an event-bound push must resend only to devices whose earlier
 * attempt failed transiently, never to devices already sent or still in flight.
 * Call pushes keep the legacy duplicate-skip path.
 */
import { beforeEach, describe, expect, it, vi } from "vitest";
import type { NotificationSideEffectPayloadOut } from "@/lib/notifications/publish-notification-side-effect";

const loadActivePushTargets = vi.fn();
const insertDetailed = vi.fn();
const reclaim = vi.fn();
const sendFcmToTarget = vi.fn();

vi.mock("@/lib/push/dispatch/load-active-push-targets", async () => {
  const actual = await vi.importActual<typeof import("@/lib/push/dispatch/load-active-push-targets")>(
    "@/lib/push/dispatch/load-active-push-targets"
  );
  return {
    loadActivePushTargets: (...args: unknown[]) => loadActivePushTargets(...args),
    insertNotificationDelivery: vi.fn(async () => "audit-id"),
    insertNotificationDeliveryDetailed: (...args: unknown[]) => insertDetailed(...args),
    reclaimNotificationDeliveryForRetry: (...args: unknown[]) => reclaim(...args),
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
  sendApnsToTarget: vi.fn(),
  sendVoipApnsToTarget: vi.fn(),
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
  chain.maybeSingle = vi.fn(async () => ({ data: { id: "ev-1", user_id: "user-1" }, error: null }));
  chain.then = (resolve: (v: unknown) => void) => resolve({ data: null, error: null });
  return { from: vi.fn(() => chain) };
}
vi.mock("@/lib/supabase/try-supabase-server", () => ({
  tryCreateSupabaseServiceClient: () => fakeSvc(),
}));

const device = (id: string) => ({
  id,
  source: "user_devices",
  push_provider: "fcm",
  push_token: `token-${id}-abcdefg`,
  device_id: `hw-${id}`,
  platform: "android",
});

function payload(partial: Partial<NotificationSideEffectPayloadOut> = {}): NotificationSideEffectPayloadOut {
  return {
    user_id: "user-1",
    notification_type: "commerce",
    title: "t",
    body: "b",
    link_url: null,
    link_url_absolute: null,
    occurred_at: new Date().toISOString(),
    meta: { kind: "order_status" },
    ...partial,
  };
}

async function run(partial?: Partial<NotificationSideEffectPayloadOut>, opts?: Record<string, unknown>) {
  const { dispatchPushForUser } = await import("@/lib/push/dispatch/dispatch-push-for-user");
  return dispatchPushForUser(payload(partial), { notification_event_id: "ev-1", ...opts });
}

describe("SRV-01 dispatch retry", () => {
  beforeEach(() => {
    process.env.PUSH_DISPATCH_ENABLED = "1";
    loadActivePushTargets.mockReset().mockResolvedValue([device("d1")]);
    insertDetailed.mockReset();
    reclaim.mockReset();
    sendFcmToTarget.mockReset().mockResolvedValue({ status: "sent", provider_response: {} });
  });

  it("first attempt: inserted row → send once → sent", async () => {
    insertDetailed.mockResolvedValue({ kind: "inserted", id: "row-1" });
    const r = await run();
    expect(sendFcmToTarget).toHaveBeenCalledTimes(1);
    expect(reclaim).not.toHaveBeenCalled();
    expect(r.outcome).toBe("sent");
  });

  it("retry after transient failure: conflict → reclaimed → resend", async () => {
    insertDetailed.mockResolvedValue({ kind: "conflict" });
    reclaim.mockResolvedValue({ kind: "reclaimed", id: "row-1", attempt: 2 });
    const r = await run();
    expect(reclaim).toHaveBeenCalledTimes(1);
    expect(sendFcmToTarget).toHaveBeenCalledTimes(1);
    expect(r.outcome).toBe("sent");
  });

  it("retry when the device was already sent → no provider call, outcome sent", async () => {
    insertDetailed.mockResolvedValue({ kind: "conflict" });
    reclaim.mockResolvedValue({ kind: "already_sent" });
    const r = await run();
    expect(sendFcmToTarget).not.toHaveBeenCalled();
    expect(r.outcome).toBe("sent");
  });

  it("pending row (in flight / crashed mid-send) is never resent and stays retryable", async () => {
    insertDetailed.mockResolvedValue({ kind: "conflict" });
    reclaim.mockResolvedValue({ kind: "in_flight" });
    const r = await run();
    expect(sendFcmToTarget).not.toHaveBeenCalled();
    expect(r.outcome).toBe("retryable");
  });

  it("previous permanent failure → no resend, permanent", async () => {
    insertDetailed.mockResolvedValue({ kind: "conflict" });
    reclaim.mockResolvedValue({ kind: "permanent" });
    const r = await run();
    expect(sendFcmToTarget).not.toHaveBeenCalled();
    expect(r.outcome).toBe("noop");
  });

  it("non-23505 insert error is not treated as duplicate: no untracked send, retryable", async () => {
    insertDetailed.mockResolvedValue({ kind: "error", message: "timeout" });
    const r = await run();
    expect(reclaim).not.toHaveBeenCalled();
    expect(sendFcmToTarget).not.toHaveBeenCalled();
    expect(r.outcome).toBe("retryable");
  });

  it("partial success keeps the event retryable for the failed device only", async () => {
    loadActivePushTargets.mockResolvedValue([device("d1"), device("d2")]);
    insertDetailed.mockResolvedValue({ kind: "inserted", id: "row" });
    sendFcmToTarget
      .mockResolvedValueOnce({ status: "sent", provider_response: {} })
      .mockResolvedValueOnce({ status: "failed", error_message: "503", provider_response: { http_status: 503 } });
    const r = await run();
    expect(r.outcome).toBe("retryable");

    // Next handoff attempt: d1 already sent, d2 reclaimed.
    insertDetailed.mockResolvedValue({ kind: "conflict" });
    reclaim
      .mockResolvedValueOnce({ kind: "already_sent" })
      .mockResolvedValueOnce({ kind: "reclaimed", id: "row-d2", attempt: 2 });
    sendFcmToTarget.mockReset().mockResolvedValue({ status: "sent", provider_response: {} });
    const r2 = await run();
    expect(sendFcmToTarget).toHaveBeenCalledTimes(1);
    expect((sendFcmToTarget.mock.calls[0][0] as { id: string }).id).toBe("d2");
    expect(r2.outcome).toBe("sent");
  });

  it("FCM invalid_token failure is permanent, not retryable", async () => {
    insertDetailed.mockResolvedValue({ kind: "inserted", id: "row-1" });
    sendFcmToTarget.mockResolvedValue({
      status: "failed",
      error_message: "UNREGISTERED",
      provider_response: { invalid_token: true },
    });
    const r = await run();
    expect(r.outcome).toBe("permanent");
  });

  it("call push keeps legacy duplicate skip (no reclaim)", async () => {
    insertDetailed.mockResolvedValue({ kind: "conflict" });
    const r = await run(
      { notification_type: "community_messenger_missed_call" },
      { call_push_kind: "missed_call", skip_settings_gate: true }
    );
    expect(reclaim).not.toHaveBeenCalled();
    expect(sendFcmToTarget).not.toHaveBeenCalled();
    expect(r.deliveries.some((d) => (d.provider_response as { reason?: string })?.reason === "duplicate_delivery")).toBe(true);
  });
});
