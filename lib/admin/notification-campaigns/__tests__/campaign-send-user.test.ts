import { beforeEach, describe, expect, it, vi } from "vitest";

const createNotificationEvent = vi.fn();
const dispatchPushForUser = vi.fn();
const loadActivePushTargets = vi.fn();
const evaluateCampaignPushGate = vi.fn();
const recordCampaignDelivery = vi.fn();

vi.mock("@/lib/notifications/core/notification-event-repository", () => ({
  createNotificationEvent: (...args: unknown[]) => createNotificationEvent(...args),
}));
vi.mock("@/lib/push/dispatch/dispatch-push-for-user", () => ({
  dispatchPushForUser: (...args: unknown[]) => dispatchPushForUser(...args),
}));
vi.mock("@/lib/push/dispatch/load-active-push-targets", () => ({
  loadActivePushTargets: (...args: unknown[]) => loadActivePushTargets(...args),
}));
vi.mock("@/lib/admin/notification-campaigns/campaign-eligibility", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/lib/admin/notification-campaigns/campaign-eligibility")>();
  return {
    ...actual,
    evaluateCampaignPushGate: (...args: unknown[]) => evaluateCampaignPushGate(...args),
  };
});
vi.mock("@/lib/admin/notification-campaigns/campaign-delivery-recorder", () => ({
  recordCampaignDelivery: (...args: unknown[]) => recordCampaignDelivery(...args),
}));
vi.mock("@/lib/notifications/pipeline/notify-badge-service", () => ({
  fetchDomainBadgeAuthorityPayload: async () => ({
    projection: { appIconTotal: 0, bellTotal: 0 },
  }),
}));

const baseCampaign = {
  id: "camp-1",
  type: "notice" as const,
  target_type: "all",
  title: "Hello",
  body: "World",
  channel: "push_and_in_app" as const,
  target_url: null,
  image_url: null,
  deeplink_url: "/notifications",
  web_url: null,
  push_image_url: null,
  in_app_image_url: "https://cdn.example/inapp.jpg",
  priority: "normal" as const,
  visibility_policy: "default" as const,
  target_payload: null,
  segment_region_code: null,
  send_progress_offset: 0,
  status: "sending",
  sent_count: 0,
  skipped_count: 0,
  failed_count: 0,
  target_count: 0,
};

const occurrenceId = "occ-1";

function svcMock(deviceRows: unknown[] = []) {
  return {
    from(table: string) {
      if (table === "user_devices") {
        return {
          select: () => ({
            eq: () => ({
              eq: async () => ({ data: deviceRows, error: null }),
            }),
          }),
        };
      }
      return {
        from: () => ({ upsert: async () => ({ error: null }) }),
        upsert: async () => ({ error: null }),
      };
    },
  };
}

describe("sendCampaignToUser skip reasons", () => {
  beforeEach(() => {
    vi.resetModules();
    createNotificationEvent.mockReset();
    dispatchPushForUser.mockReset();
    loadActivePushTargets.mockReset();
    evaluateCampaignPushGate.mockReset();
    recordCampaignDelivery.mockReset();
    recordCampaignDelivery.mockResolvedValue("del-1");
    createNotificationEvent.mockResolvedValue({
      ok: true,
      row: { id: "evt-1", user_id: "u1", title: "Hello", body: "World", created_at: new Date().toISOString(), category: "notice_published", type: "notice_published" },
    });
  });

  it("B-1: 서버는 앱 사용 중을 판정하지 않고 기기로 보낸다 (앱이 보이면 기기가 OS 알림을 숨김)", async () => {
    loadActivePushTargets.mockResolvedValue([
      { id: "dev-1", source: "user_devices", push_provider: "fcm", push_token: "tok", platform: "android", device_id: "d1" },
    ]);
    evaluateCampaignPushGate.mockResolvedValue({ allowed: true, skipReason: null });
    dispatchPushForUser.mockResolvedValue({ ok: true, targets_found: 1, deliveries: [{ status: "sent", device_id: "dev-1", provider_response: {} }] });
    const { sendCampaignToUser } = await import("@/lib/admin/notification-campaigns/campaign-send-user");
    const out = await sendCampaignToUser(svcMock() as never, baseCampaign, occurrenceId, "u1");
    expect(out.sent).toBe(true);
    expect(dispatchPushForUser).toHaveBeenCalledTimes(1);
    expect(recordCampaignDelivery).not.toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({ skipReason: "foreground_no_os_push" })
    );
  });

  it("A-4: 발송 스위치 꺼짐은 token_missing 이 아니라 dispatch_disabled", async () => {
    loadActivePushTargets.mockResolvedValue([
      { id: "dev-1", source: "user_devices", push_provider: "fcm", push_token: "tok", platform: "android", device_id: "d1" },
    ]);
    evaluateCampaignPushGate.mockResolvedValue({ allowed: true, skipReason: null });
    dispatchPushForUser.mockResolvedValue({ ok: true, targets_found: 0, deliveries: [], skipped_reason: "dispatch_disabled" });
    const { sendCampaignToUser } = await import("@/lib/admin/notification-campaigns/campaign-send-user");
    await sendCampaignToUser(svcMock() as never, { ...baseCampaign, channel: "push_only" }, occurrenceId, "u1");
    expect(recordCampaignDelivery).toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({ skipReason: "dispatch_disabled", channel: "push" })
    );
  });

  it("skips push when no tokens with token_missing", async () => {
    loadActivePushTargets.mockResolvedValue([]);
    const { sendCampaignToUser } = await import("@/lib/admin/notification-campaigns/campaign-send-user");
    const out = await sendCampaignToUser(svcMock() as never, { ...baseCampaign, channel: "push_only" }, occurrenceId, "u1");
    expect(out.skipped).toBe(true);
    expect(recordCampaignDelivery).toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({ skipReason: "token_missing", channel: "push" })
    );
  });

  it("R-4: 기기 권한 값과 무관하게 실제 발송 결과만 기록한다 (permission_denied 모순 기록 없음)", async () => {
    loadActivePushTargets.mockResolvedValue([
      { id: "dev-1", source: "user_devices", push_provider: "fcm", push_token: "tok", platform: "android", device_id: "d1" },
    ]);
    evaluateCampaignPushGate.mockResolvedValue({ allowed: true, skipReason: null });
    dispatchPushForUser.mockResolvedValue({ ok: true, targets_found: 1, deliveries: [{ status: "sent", device_id: "dev-1", provider_response: {} }] });
    const { sendCampaignToUser } = await import("@/lib/admin/notification-campaigns/campaign-send-user");
    const out = await sendCampaignToUser(
      svcMock([{ id: "dev-1", notification_permission_status: "denied", push_provider: "fcm", platform: "android" }]) as never,
      { ...baseCampaign, channel: "push_only" },
      occurrenceId,
      "u1"
    );
    expect(out.sent).toBe(true);
    expect(recordCampaignDelivery).not.toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({ skipReason: "permission_denied" })
    );
    expect(recordCampaignDelivery).toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({ channel: "push", status: "sent", deviceId: "dev-1" })
    );
  });

  it("D-Q3: 게이트의 알림음 끔(soundMode) 을 캠페인 푸시 payload 에 싣는다", async () => {
    loadActivePushTargets.mockResolvedValue([
      { id: "dev-1", source: "user_devices", push_provider: "fcm", push_token: "tok", platform: "android", device_id: "d1" },
    ]);
    evaluateCampaignPushGate.mockResolvedValue({ allowed: true, skipReason: null, soundMode: "silent" });
    dispatchPushForUser.mockResolvedValue({ ok: true, targets_found: 1, deliveries: [{ status: "sent", device_id: "dev-1", provider_response: {} }] });
    const { sendCampaignToUser } = await import("@/lib/admin/notification-campaigns/campaign-send-user");
    await sendCampaignToUser(
      svcMock([{ id: "dev-1", notification_permission_status: "granted", push_provider: "fcm", platform: "android" }]) as never,
      { ...baseCampaign, channel: "push_only" },
      occurrenceId,
      "u1"
    );
    expect(dispatchPushForUser).toHaveBeenCalledTimes(1);
    expect(dispatchPushForUser.mock.calls[0][0].meta.push_sound_mode).toBe("silent");
  });

  it("skips push when user setting blocked", async () => {
    loadActivePushTargets.mockResolvedValue([
      { id: "dev-1", source: "user_devices", push_provider: "fcm", push_token: "tok", platform: "android", device_id: "d1" },
    ]);
    evaluateCampaignPushGate.mockResolvedValue({ allowed: false, skipReason: "user_setting_blocked" });
    const { sendCampaignToUser } = await import("@/lib/admin/notification-campaigns/campaign-send-user");
    const out = await sendCampaignToUser(svcMock() as never, { ...baseCampaign, channel: "push_only" }, occurrenceId, "u1");
    expect(out.skipped).toBe(true);
    expect(out.skipReason).toBe("user_setting_blocked");
  });

  it("in_app_only never calls dispatchPushForUser", async () => {
    const { sendCampaignToUser } = await import("@/lib/admin/notification-campaigns/campaign-send-user");
    const out = await sendCampaignToUser(svcMock() as never, { ...baseCampaign, channel: "in_app_only" }, occurrenceId, "u1");
    expect(out.sent).toBe(true);
    expect(dispatchPushForUser).not.toHaveBeenCalled();
  });
});
