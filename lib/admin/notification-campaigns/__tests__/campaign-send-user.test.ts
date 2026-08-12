import { beforeEach, describe, expect, it, vi } from "vitest";

const createNotificationEvent = vi.fn();
const dispatchPushForUser = vi.fn();
const loadActivePushTargets = vi.fn();
const evaluateCampaignPushGate = vi.fn();
const recordCampaignDelivery = vi.fn();
const resolveCampaignUserAppState = vi.fn();

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
vi.mock("@/lib/admin/notification-campaigns/campaign-presence", () => ({
  resolveCampaignUserAppState: (...args: unknown[]) => resolveCampaignUserAppState(...args),
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

const maps = { notif: new Map(), prefs: new Map() };
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
    resolveCampaignUserAppState.mockReset();
    recordCampaignDelivery.mockResolvedValue("del-1");
    createNotificationEvent.mockResolvedValue({
      ok: true,
      row: { id: "evt-1", user_id: "u1", title: "Hello", body: "World", created_at: new Date().toISOString(), category: "notice_published", type: "notice_published" },
    });
  });

  it("skips push in foreground with foreground_no_os_push", async () => {
    resolveCampaignUserAppState.mockResolvedValue("foreground");
    const { sendCampaignToUser } = await import("@/lib/admin/notification-campaigns/campaign-send-user");
    const out = await sendCampaignToUser(svcMock() as never, { ...baseCampaign, channel: "push_only" }, occurrenceId, "u1", maps);
    expect(out.skipped).toBe(true);
    expect(out.skipReason).toBe("foreground_no_os_push");
    expect(dispatchPushForUser).not.toHaveBeenCalled();
  });

  it("skips push when no tokens with token_missing", async () => {
    resolveCampaignUserAppState.mockResolvedValue("background");
    loadActivePushTargets.mockResolvedValue([]);
    const { sendCampaignToUser } = await import("@/lib/admin/notification-campaigns/campaign-send-user");
    const out = await sendCampaignToUser(svcMock() as never, { ...baseCampaign, channel: "push_only" }, occurrenceId, "u1", maps);
    expect(out.skipped).toBe(true);
    expect(recordCampaignDelivery).toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({ skipReason: "token_missing", channel: "push" })
    );
  });

  it("skips device with permission_denied", async () => {
    resolveCampaignUserAppState.mockResolvedValue("background");
    loadActivePushTargets.mockResolvedValue([
      { id: "dev-1", source: "user_devices", push_provider: "fcm", push_token: "tok", platform: "android", device_id: "d1" },
    ]);
    evaluateCampaignPushGate.mockResolvedValue({ allowed: true, skipReason: null });
    dispatchPushForUser.mockResolvedValue({ ok: true, targets_found: 1, deliveries: [{ status: "sent", device_id: "dev-1", provider_response: {} }] });
    const { sendCampaignToUser } = await import("@/lib/admin/notification-campaigns/campaign-send-user");
    await sendCampaignToUser(
      svcMock([{ id: "dev-1", notification_permission_status: "denied", push_provider: "fcm", platform: "android" }]) as never,
      { ...baseCampaign, channel: "push_only" },
      occurrenceId,
      "u1",
      maps
    );
    expect(recordCampaignDelivery).toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({ skipReason: "permission_denied" })
    );
  });

  it("skips push when user setting blocked", async () => {
    resolveCampaignUserAppState.mockResolvedValue("background");
    loadActivePushTargets.mockResolvedValue([
      { id: "dev-1", source: "user_devices", push_provider: "fcm", push_token: "tok", platform: "android", device_id: "d1" },
    ]);
    evaluateCampaignPushGate.mockResolvedValue({ allowed: false, skipReason: "user_setting_blocked" });
    const { sendCampaignToUser } = await import("@/lib/admin/notification-campaigns/campaign-send-user");
    const out = await sendCampaignToUser(svcMock() as never, { ...baseCampaign, channel: "push_only" }, occurrenceId, "u1", maps);
    expect(out.skipped).toBe(true);
    expect(out.skipReason).toBe("user_setting_blocked");
  });

  it("in_app_only never calls dispatchPushForUser", async () => {
    resolveCampaignUserAppState.mockResolvedValue("background");
    const { sendCampaignToUser } = await import("@/lib/admin/notification-campaigns/campaign-send-user");
    const out = await sendCampaignToUser(svcMock() as never, { ...baseCampaign, channel: "in_app_only" }, occurrenceId, "u1", maps);
    expect(out.sent).toBe(true);
    expect(dispatchPushForUser).not.toHaveBeenCalled();
  });
});
