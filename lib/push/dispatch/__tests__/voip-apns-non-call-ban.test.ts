import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@/lib/push/dispatch/voip-apns-sender-impl", () => ({
  sendVoipApnsImpl: vi.fn(async () => ({
    status: "sent" as const,
    provider_response: { provider: "voip_apns" },
  })),
}));

describe("voip apns non-call ban", () => {
  beforeEach(() => {
    vi.resetModules();
    process.env.APNS_KEY_P8 = "dummy";
    process.env.APNS_KEY_ID = "KEYID";
    process.env.APNS_TEAM_ID = "TEAMID";
    process.env.APNS_VOIP_TOPIC = "com.dibay.app.voip";
  });

  it("skips VoIP send for admin/notice payload without call_push_kind", async () => {
    const { sendVoipApnsToTarget } = await import("@/lib/push/dispatch/apns-sender");
    const { sendVoipApnsImpl } = await import("@/lib/push/dispatch/voip-apns-sender-impl");

    const result = await sendVoipApnsToTarget(
      {
        id: "dev-1",
        push_token: "voip-token",
        push_provider: "voip_apns",
        source: "user_devices",
        platform: "ios",
        device_id: "dev-1",
        environment: "production",
      },
      {
        user_id: "u1",
        notification_type: "notice",
        title: "Admin",
        body: "Hello",
        link_url: "/mypage/notifications",
        link_url_absolute: null,
        occurred_at: new Date().toISOString(),
      },
      undefined
    );

    expect(result).toEqual({
      status: "skipped",
      provider_response: { reason: "voip_requires_call_push_kind" },
    });
    expect(sendVoipApnsImpl).not.toHaveBeenCalled();
  });

  it("allows VoIP only when call_push_kind is explicit", async () => {
    const { sendVoipApnsToTarget } = await import("@/lib/push/dispatch/apns-sender");
    const { sendVoipApnsImpl } = await import("@/lib/push/dispatch/voip-apns-sender-impl");

    const result = await sendVoipApnsToTarget(
      {
        id: "dev-1",
        push_token: "voip-token",
        push_provider: "voip_apns",
        source: "user_devices",
        platform: "ios",
        device_id: "dev-1",
        environment: "production",
      },
      {
        user_id: "u1",
        notification_type: "community_messenger_incoming_call",
        title: "Call",
        body: "Incoming",
        link_url: "/",
        link_url_absolute: null,
        occurred_at: new Date().toISOString(),
      },
      { call_push_kind: "incoming_call" }
    );

    expect(result.status).toBe("sent");
    expect(sendVoipApnsImpl).toHaveBeenCalledWith(
      expect.objectContaining({ callPushKind: "incoming_call" })
    );
  });
});
