/* U1 DUP-1: duplicate re-run push dedupe via existing notification event id. */
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

function svcWithEvents(existingEventId: string | null) {
  const base = svcMock([]);
  return {
    from(table: string) {
      if (table === "notification_events") {
        const q = {
          select: () => q,
          eq: () => q,
          maybeSingle: async () => ({ data: existingEventId ? { id: existingEventId } : null, error: null }),
        };
        return q;
      }
      return base.from(table);
    },
  };
}

describe("U1-B duplicate re-run push dedupe (isolated)", () => {
  beforeEach(() => {
    vi.resetModules();
    createNotificationEvent.mockReset();
    dispatchPushForUser.mockReset();
    loadActivePushTargets.mockReset();
    evaluateCampaignPushGate.mockReset();
    recordCampaignDelivery.mockReset();
    resolveCampaignUserAppState.mockReset();
    recordCampaignDelivery.mockResolvedValue("del-1");
    resolveCampaignUserAppState.mockResolvedValue("background");
    loadActivePushTargets.mockResolvedValue([
      { id: "dev-1", source: "user_devices", push_provider: "fcm", push_token: "tok", platform: "android", device_id: "d1" },
    ]);
    evaluateCampaignPushGate.mockResolvedValue({ allowed: true, skipReason: null });
    dispatchPushForUser.mockResolvedValue({ ok: true, targets_found: 1, deliveries: [{ status: "skipped", device_id: "dev-1", provider_response: { reason: "duplicate_delivery" } }] });
  });

  it("re-run after in-app duplicate dispatches push WITH the existing event id (device-level dedupe applies)", async () => {
    createNotificationEvent.mockResolvedValue({ ok: false, duplicate: true, error: "duplicate" });
    const { sendCampaignToUser } = await import("@/lib/admin/notification-campaigns/campaign-send-user");
    await sendCampaignToUser(svcWithEvents("evt-existing") as never, baseCampaign, occurrenceId, "u1", maps);
    expect(dispatchPushForUser).toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({ notification_event_id: "evt-existing" })
    );
  });

  it("dedupe key: default campaign scope unchanged; occurrence scope for recurring", async () => {
    createNotificationEvent.mockResolvedValue({ ok: true, row: { id: "e1" } });
    const { sendCampaignToUser } = await import("@/lib/admin/notification-campaigns/campaign-send-user");
    await sendCampaignToUser(svcWithEvents(null) as never, { ...baseCampaign, channel: "in_app_only" }, occurrenceId, "u1", maps);
    expect(createNotificationEvent.mock.calls[0][1].dedupeKey).toBe("admin_campaign:camp-1:u1");
    await sendCampaignToUser(svcWithEvents(null) as never, { ...baseCampaign, channel: "in_app_only" }, occurrenceId, "u1", maps, { dedupeScope: "occurrence" });
    expect(createNotificationEvent.mock.calls[1][1].dedupeKey).toBe("admin_campaign:camp-1:occ-1:u1");
  });
});
