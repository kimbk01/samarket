/**
 * Scheduled drain must revalidate Event/official source before any batch send.
 * Same SSOT as manual POST .../send (evaluateOfficialCampaignSendEligibility).
 */
import { beforeEach, describe, expect, it, vi } from "vitest";

const getCampaignOccurrence = vi.fn();
const evaluateOfficialCampaignSendEligibility = vi.fn();
const runNotificationCampaignSendBatch = vi.fn();

vi.mock("@/lib/admin/notification-campaigns/campaign-occurrence-service", () => ({
  getCampaignOccurrence: (...args: unknown[]) => getCampaignOccurrence(...args),
  claimDueOccurrence: vi.fn(),
  claimOccurrenceSend: vi.fn(),
}));

vi.mock("@/lib/admin/notification-campaigns/campaign-source-authority", () => ({
  evaluateOfficialCampaignSendEligibility: (...args: unknown[]) =>
    evaluateOfficialCampaignSendEligibility(...args),
}));

vi.mock("@/lib/admin/notification-campaigns/run-campaign-send-batch", () => ({
  runNotificationCampaignSendBatch: (...args: unknown[]) => runNotificationCampaignSendBatch(...args),
}));

describe("drainNotificationCampaignSendBatches source revalidation", () => {
  beforeEach(() => {
    vi.resetModules();
    getCampaignOccurrence.mockReset();
    evaluateOfficialCampaignSendEligibility.mockReset();
    runNotificationCampaignSendBatch.mockReset();
  });

  it("rejects drain when Event source became unpublished — no batch send", async () => {
    getCampaignOccurrence.mockResolvedValue({
      id: "occ-1",
      campaign_id: "camp-1",
      status: "sending",
    });
    const occUpdateEq = vi.fn().mockResolvedValue({ error: null });
    const campUpdateIn = vi.fn().mockResolvedValue({ error: null });
    const from = vi.fn((table: string) => {
      if (table === "admin_notification_campaigns") {
        return {
          select: vi.fn(() => ({
            eq: vi.fn(() => ({
              maybeSingle: vi.fn().mockResolvedValue({
                data: {
                  id: "camp-1",
                  type: "marketing",
                  target_payload: { platform_event_id: "evt-1" },
                  deeplink_url: "/events/evt-1",
                  web_url: "/events/evt-1",
                  target_url: "/events/evt-1",
                },
                error: null,
              }),
            })),
          })),
          update: vi.fn(() => ({
            eq: vi.fn(() => ({
              in: campUpdateIn,
            })),
          })),
        };
      }
      if (table === "admin_notification_campaign_occurrences") {
        return {
          update: vi.fn(() => ({ eq: occUpdateEq })),
        };
      }
      return {};
    });
    const svc = { from } as never;
    evaluateOfficialCampaignSendEligibility.mockResolvedValue({
      ok: false,
      error: "event_source_unpublished",
    });

    const { drainNotificationCampaignSendBatches } = await import(
      "@/lib/admin/notification-campaigns/claim-scheduled-campaign"
    );
    const result = await drainNotificationCampaignSendBatches(svc, "occ-1");
    expect(result).toEqual({
      ok: false,
      done: true,
      batches: 0,
      sent: 0,
      skipped: 0,
      failed: 0,
      error: "event_source_unpublished",
    });
    expect(runNotificationCampaignSendBatch).not.toHaveBeenCalled();
    expect(evaluateOfficialCampaignSendEligibility).toHaveBeenCalled();
    expect(occUpdateEq).toHaveBeenCalled();
  });

  it("proceeds to batch drain when source eligibility PASS", async () => {
    getCampaignOccurrence.mockResolvedValue({
      id: "occ-2",
      campaign_id: "camp-2",
      status: "sending",
    });
    const from = vi.fn((table: string) => {
      if (table === "admin_notification_campaigns") {
        return {
          select: vi.fn(() => ({
            eq: vi.fn(() => ({
              maybeSingle: vi.fn().mockResolvedValue({
                data: {
                  id: "camp-2",
                  type: "marketing",
                  target_payload: { platform_event_id: "evt-2" },
                  deeplink_url: "/events/evt-2",
                  web_url: "/events/evt-2",
                  target_url: "/events/evt-2",
                },
                error: null,
              }),
            })),
          })),
        };
      }
      return {
        update: vi.fn(() => ({ eq: vi.fn().mockResolvedValue({ error: null }) })),
      };
    });
    const svc = { from } as never;
    evaluateOfficialCampaignSendEligibility.mockResolvedValue({
      ok: true,
      mode: "platform_event",
      content_id: "evt-2",
      canonical_route: "/events/evt-2",
    });
    runNotificationCampaignSendBatch.mockResolvedValue({
      ok: true,
      processed: 1,
      sent: 1,
      skipped: 0,
      failed: 0,
      done: true,
    });

    const { drainNotificationCampaignSendBatches } = await import(
      "@/lib/admin/notification-campaigns/claim-scheduled-campaign"
    );
    const result = await drainNotificationCampaignSendBatches(svc, "occ-2");
    expect(result.ok).toBe(true);
    expect(result.sent).toBe(1);
    expect(runNotificationCampaignSendBatch).toHaveBeenCalledWith(svc, "occ-2");
  });
});
