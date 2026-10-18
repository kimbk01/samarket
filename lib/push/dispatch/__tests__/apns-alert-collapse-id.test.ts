import { beforeEach, describe, expect, it, vi } from "vitest";
import type { NotificationSideEffectPayloadOut } from "@/lib/notifications/publish-notification-side-effect";

const sendApnsAlertImpl = vi.fn(async (_input: Record<string, unknown>) => ({ status: "sent" as const }));
vi.mock("@/lib/push/dispatch/apns-sender-impl", () => ({
  sendApnsAlertImpl: (input: Record<string, unknown>) => sendApnsAlertImpl(input),
}));

const target = { id: "d", source: "user_devices", push_provider: "apns", push_token: "tok", platform: "ios" } as never;
const out = (nt: string): NotificationSideEffectPayloadOut => ({
  user_id: "u",
  notification_type: nt,
  title: "t",
  body: "b",
  link_url: null,
  link_url_absolute: null,
  occurred_at: "2026-10-18T00:00:00.000Z",
  meta: {},
});

describe("APNs alert collapse-id (SRV-01)", () => {
  beforeEach(() => {
    sendApnsAlertImpl.mockClear();
    process.env.APNS_KEY_P8 = "k";
    process.env.APNS_KEY_ID = "i";
    process.env.APNS_TEAM_ID = "t";
    process.env.APNS_BUNDLE_ID = "com.dibay.app";
  });

  it("event-bound non-call alert carries collapseId = notification_event_id", async () => {
    const { sendApnsToTarget } = await import("@/lib/push/dispatch/apns-sender");
    await sendApnsToTarget(target, out("commerce"), { notification_event_id: "ev-1" });
    expect(sendApnsAlertImpl.mock.calls[0][0]).toMatchObject({ collapseId: "ev-1" });
  });

  it("call alerts (missed call) carry no collapseId", async () => {
    const { sendApnsToTarget } = await import("@/lib/push/dispatch/apns-sender");
    await sendApnsToTarget(target, out("community_messenger_missed_call"), {
      notification_event_id: "ev-2",
      call_push_kind: "missed_call",
    });
    expect(sendApnsAlertImpl.mock.calls[0][0]).toMatchObject({ collapseId: null });
  });

  it("untracked alerts carry no collapseId", async () => {
    const { sendApnsToTarget } = await import("@/lib/push/dispatch/apns-sender");
    await sendApnsToTarget(target, out("commerce"), {});
    expect(sendApnsAlertImpl.mock.calls[0][0]).toMatchObject({ collapseId: null });
  });
});
