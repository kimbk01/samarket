import { beforeEach, describe, expect, it, vi } from "vitest";
import {
  normalizeSelectedUserIds,
  readSelectedUserIdsFromPayload,
} from "@/lib/admin/notification-campaigns/selected-user-ids";
import { resolveCampaignSentCountAggregate } from "@/lib/admin/notification-campaigns/campaign-delivery-recorder";

const sendCampaignToUser = vi.fn();

vi.mock("@/lib/admin/notification-campaigns/campaign-send-user", () => ({
  sendCampaignToUser: (...args: unknown[]) => sendCampaignToUser(...args),
}));

vi.mock("@/lib/admin/notification-campaigns/campaign-eligibility", () => ({
  loadCampaignSettingsMaps: vi.fn(async () => ({})),
  evaluateCampaignUserEligibility: vi.fn(),
}));

vi.mock("@/lib/admin/notification-campaigns/campaign-occurrence-service", async () => {
  const actual = await vi.importActual<
    typeof import("@/lib/admin/notification-campaigns/campaign-occurrence-service")
  >("@/lib/admin/notification-campaigns/campaign-occurrence-service");
  return {
    ...actual,
    getCampaignOccurrence: vi.fn(),
  };
});

vi.mock("@/lib/admin/notification-campaigns/campaign-delivery-recorder", async () => {
  const actual = await vi.importActual<
    typeof import("@/lib/admin/notification-campaigns/campaign-delivery-recorder")
  >("@/lib/admin/notification-campaigns/campaign-delivery-recorder");
  return {
    ...actual,
    refreshOccurrenceMetrics: vi.fn(async () => undefined),
    recordCampaignDelivery: vi.fn(),
  };
});

describe("DEF-02 sent_count aggregate", () => {
  it("uses in_app_sent when push_sent is 0 (in_app_only)", () => {
    expect(resolveCampaignSentCountAggregate(0, 1)).toBe(1);
  });

  it("uses push_sent when in_app_sent is 0 (push_only)", () => {
    expect(resolveCampaignSentCountAggregate(3, 0)).toBe(3);
  });

  it("does not double-count push_and_in_app for the same cohort", () => {
    expect(resolveCampaignSentCountAggregate(1, 1)).toBe(1);
  });
});

describe("DEF-03 selected_user_ids payload", () => {
  it("reads and normalizes selected_user_ids", () => {
    expect(readSelectedUserIdsFromPayload({ selected_user_ids: [" a ", "a", "b"] })).toEqual([
      "a",
      "b",
    ]);
    expect(normalizeSelectedUserIds(["x", "", "x", "y"])).toEqual(["x", "y"]);
    expect(readSelectedUserIdsFromPayload({})).toEqual([]);
  });
});

describe("DEF-01 test-send honors campaign channel", () => {
  beforeEach(() => {
    sendCampaignToUser.mockReset();
  });

  async function runTestSend(channel: string) {
    const { getCampaignOccurrence } = await import(
      "@/lib/admin/notification-campaigns/campaign-occurrence-service"
    );
    vi.mocked(getCampaignOccurrence).mockResolvedValue({
      id: "occ-1",
      campaign_id: "camp-1",
      status: "queued",
      started_at: null,
      content_snapshot: {
        title: "t",
        body: "b",
        type: "marketing",
        channel,
        target_type: "selected_users",
        deeplink_url: "/market",
        web_url: null,
        push_image_url: null,
        in_app_image_url: null,
        target_payload: {},
      },
    } as never);

    const svc = {
      from() {
        return {
          update() {
            return {
              eq: async () => ({ data: null, error: null }),
            };
          },
        };
      },
    };

    sendCampaignToUser.mockResolvedValue({
      ok: true,
      sent: true,
      skipped: false,
      failed: false,
      skipReason: null,
      notificationEventId: "e1",
    });

    const { runNotificationCampaignTestSend } = await import(
      "@/lib/admin/notification-campaigns/run-campaign-send-batch"
    );
    await runNotificationCampaignTestSend(svc as never, "camp-1", "occ-1", ["u1"]);
    return sendCampaignToUser.mock.calls[0]?.[5] as { forceChannel?: string } | undefined;
  }

  it("in_app_only does not force push_and_in_app", async () => {
    const opts = await runTestSend("in_app_only");
    expect(opts?.forceChannel).toBeUndefined();
  });

  it("push_and_in_app does not need force override", async () => {
    const opts = await runTestSend("push_and_in_app");
    expect(opts?.forceChannel).toBeUndefined();
  });

  it("test_only still forces push_and_in_app", async () => {
    const opts = await runTestSend("test_only");
    expect(opts?.forceChannel).toBe("push_and_in_app");
  });
});
