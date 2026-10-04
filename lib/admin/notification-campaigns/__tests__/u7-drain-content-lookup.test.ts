/**
 * U7 / EVENT-06 — scheduled drain: transient app_notices lookup failure must not
 * terminally fail the occurrence (continuable); unpublished content fails it.
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

function makeSvc(noticeLookup: { data: unknown; error: { message: string } | null }) {
  const occUpdate = vi.fn(() => ({ eq: vi.fn().mockResolvedValue({ error: null }) }));
  const campUpdate = vi.fn(() => ({ eq: vi.fn(() => ({ in: vi.fn().mockResolvedValue({ error: null }) })) }));
  const noticeEq = vi.fn(() => ({ maybeSingle: vi.fn().mockResolvedValue(noticeLookup) }));
  const noticeSelect = vi.fn(() => ({ eq: noticeEq }));
  const from = vi.fn((table: string) => {
    if (table === "admin_notification_campaigns") {
      return {
        select: vi.fn(() => ({
          eq: vi.fn(() => ({
            maybeSingle: vi.fn().mockResolvedValue({
              data: { id: "camp-1", type: "notice", target_payload: { appNoticeId: "n-1" } },
              error: null,
            }),
          })),
        })),
        update: campUpdate,
      };
    }
    if (table === "admin_notification_campaign_occurrences") return { update: occUpdate };
    if (table === "app_notices") return { select: noticeSelect };
    throw new Error(`unexpected table ${table}`);
  });
  return { svc: { from } as never, occUpdate, campUpdate, noticeSelect, noticeEq };
}

describe("drain content lookup (U7)", () => {
  beforeEach(() => {
    vi.resetModules();
    getCampaignOccurrence.mockReset().mockResolvedValue({ id: "occ-1", campaign_id: "camp-1", status: "sending" });
    evaluateOfficialCampaignSendEligibility.mockReset();
    runNotificationCampaignSendBatch.mockReset();
  });

  it("passes an app_notices lookup that throws on DB error and returns the row", async () => {
    const ok = makeSvc({ data: { is_active: true }, error: null });
    evaluateOfficialCampaignSendEligibility.mockImplementation(async (_row, _ev, lookupContent) => {
      expect(await lookupContent("n-1")).toEqual({ is_active: true });
      return { ok: false, error: "content_source_unavailable" };
    });
    const { drainNotificationCampaignSendBatches } = await import(
      "@/lib/admin/notification-campaigns/claim-scheduled-campaign"
    );
    await drainNotificationCampaignSendBatches(ok.svc, "occ-1");
    expect(ok.noticeSelect).toHaveBeenCalledWith("is_active, starts_at, ends_at, archived_at, deleted_at");
    expect(ok.noticeEq).toHaveBeenCalledWith("id", "n-1");

    const bad = makeSvc({ data: null, error: { message: "db down" } });
    evaluateOfficialCampaignSendEligibility.mockImplementation(async (_row, _ev, lookupContent) => {
      await expect(lookupContent("n-1")).rejects.toThrow("db down");
      return { ok: false, error: "content_source_lookup_failed" };
    });
    await drainNotificationCampaignSendBatches(bad.svc, "occ-1");
  });

  it("content_source_lookup_failed → done:false, no terminal write, no batch", async () => {
    const { svc, occUpdate, campUpdate } = makeSvc({ data: null, error: null });
    evaluateOfficialCampaignSendEligibility.mockResolvedValue({ ok: false, error: "content_source_lookup_failed" });
    const { drainNotificationCampaignSendBatches, CAMPAIGN_CONTINUABLE_ERRORS } = await import(
      "@/lib/admin/notification-campaigns/claim-scheduled-campaign"
    );
    const r = await drainNotificationCampaignSendBatches(svc, "occ-1");
    expect(r).toEqual({ ok: false, done: false, batches: 0, sent: 0, skipped: 0, failed: 0, error: "content_source_lookup_failed" });
    expect(CAMPAIGN_CONTINUABLE_ERRORS.has("content_source_lookup_failed")).toBe(true);
    expect(occUpdate).not.toHaveBeenCalled();
    expect(campUpdate).not.toHaveBeenCalled();
    expect(runNotificationCampaignSendBatch).not.toHaveBeenCalled();
  });

  it("content_source_unavailable → occurrence failed (terminal), no batch", async () => {
    const { svc, occUpdate } = makeSvc({ data: null, error: null });
    evaluateOfficialCampaignSendEligibility.mockResolvedValue({ ok: false, error: "content_source_unavailable" });
    const { drainNotificationCampaignSendBatches } = await import(
      "@/lib/admin/notification-campaigns/claim-scheduled-campaign"
    );
    const r = await drainNotificationCampaignSendBatches(svc, "occ-1");
    expect(r).toMatchObject({ ok: false, done: true, error: "content_source_unavailable" });
    expect(occUpdate).toHaveBeenCalledWith(expect.objectContaining({ status: "failed", last_error: "content_source_unavailable" }));
    expect(runNotificationCampaignSendBatch).not.toHaveBeenCalled();
  });
});
