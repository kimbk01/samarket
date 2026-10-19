/**
 * ADM-03: stop sending / stop recurring must halt claims + batches.
 * ADM-08: a cron-claimed scheduled/recurring occurrence re-verifies its source and is skipped
 *         (recorded reason) when the notice/event is no longer public.
 */
import { beforeEach, describe, expect, it, vi } from "vitest";
import { createFakeSupabase, hasFilter } from "@/lib/admin/notification-campaigns/__tests__/fake-supabase-recorder";

const getCampaignOccurrence = vi.fn();
const evaluateOfficialCampaignSendEligibility = vi.fn();
const runNotificationCampaignSendBatch = vi.fn();

describe("batch runner halts on admin stop", () => {
  beforeEach(() => {
    vi.resetModules();
    vi.doUnmock("@/lib/admin/notification-campaigns/campaign-occurrence-service");
    vi.doUnmock("@/lib/admin/notification-campaigns/run-campaign-send-batch");
  });

  it("assertOccurrenceSendAllowed: cancelled → occurrence_cancelled (clean stop code)", async () => {
    const { assertOccurrenceSendAllowed } = await import(
      "@/lib/admin/notification-campaigns/run-campaign-send-batch"
    );
    expect(assertOccurrenceSendAllowed("cancelled")).toEqual({ ok: false, error: "occurrence_cancelled" });
    expect(assertOccurrenceSendAllowed("sent")).toEqual({ ok: false, error: "occurrence_already_completed" });
  });

  it.each(["cancelled", "ended"])("campaign %s → batch returns campaign_stopped without sending", async (status) => {
    const { svc, calls } = createFakeSupabase((c) => {
      if (c.table === "admin_notification_campaign_occurrences" && c.single) {
        return {
          data: {
            id: "occ-1",
            campaign_id: "camp-1",
            status: "sending",
            trigger_type: "recurring",
            content_snapshot: {},
            send_progress_offset: 0,
          },
        };
      }
      if (c.table === "admin_notification_campaigns" && c.single) {
        return { data: { id: "camp-1", status, type: "marketing", target_type: "all", channel: "push_only" } };
      }
      return { data: [] };
    });
    const { runNotificationCampaignSendBatch: run } = await import(
      "@/lib/admin/notification-campaigns/run-campaign-send-batch"
    );
    const out = await run(svc as never, "occ-1");
    expect(out).toMatchObject({ ok: false, done: true, error: "campaign_stopped", sent: 0 });
    expect(calls.filter((c) => c.op !== "select")).toHaveLength(0);
  });

  it("recurring campaign (active) never gets campaign.status=sending from the batch", async () => {
    const { svc, calls } = createFakeSupabase((c) => {
      if (c.table === "admin_notification_campaign_occurrences" && c.single) {
        return {
          data: {
            id: "occ-1",
            campaign_id: "camp-1",
            status: "queued",
            trigger_type: "recurring",
            content_snapshot: { title: "t", body: "b", type: "marketing", channel: "push_only", target_type: "all" },
            send_progress_offset: 0,
          },
        };
      }
      if (c.table === "admin_notification_campaigns" && c.single) {
        return { data: { id: "camp-1", status: "active", type: "marketing", target_type: "all", channel: "push_only" } };
      }
      return { data: [] };
    });
    const { runNotificationCampaignSendBatch: run } = await import(
      "@/lib/admin/notification-campaigns/run-campaign-send-batch"
    );
    await run(svc as never, "occ-1").catch(() => undefined);
    const campaignStatusWrites = calls.filter(
      (c) =>
        c.table === "admin_notification_campaigns" &&
        c.op === "update" &&
        (c.payload as Record<string, unknown>)?.status === "sending"
    );
    expect(campaignStatusWrites).toHaveLength(0);
  });
});

describe("drain: stop + ADM-08 source skip", () => {
  beforeEach(() => {
    vi.resetModules();
    getCampaignOccurrence.mockReset();
    evaluateOfficialCampaignSendEligibility.mockReset();
    runNotificationCampaignSendBatch.mockReset();
    vi.doMock("@/lib/admin/notification-campaigns/campaign-occurrence-service", () => ({
      getCampaignOccurrence: (...a: unknown[]) => getCampaignOccurrence(...a),
      claimDueOccurrence: vi.fn(),
      claimOccurrenceSend: vi.fn(),
    }));
    vi.doMock("@/lib/admin/notification-campaigns/campaign-source-authority", () => ({
      evaluateOfficialCampaignSendEligibility: (...a: unknown[]) => evaluateOfficialCampaignSendEligibility(...a),
    }));
    vi.doMock("@/lib/admin/notification-campaigns/run-campaign-send-batch", () => ({
      runNotificationCampaignSendBatch: (...a: unknown[]) => runNotificationCampaignSendBatch(...a),
    }));
  });

  const campaignRow = {
    id: "camp-1",
    type: "notice",
    target_payload: { content_id: "n1" },
    deeplink_url: null,
    web_url: null,
    target_url: null,
  };

  it("batch reporting an admin stop ends the drain cleanly (ok, done, stopped) without failure write", async () => {
    getCampaignOccurrence.mockResolvedValue({ id: "occ-1", campaign_id: "camp-1", status: "sending" });
    evaluateOfficialCampaignSendEligibility.mockResolvedValue({ ok: true, mode: "content_bound" });
    runNotificationCampaignSendBatch
      .mockResolvedValueOnce({ ok: true, processed: 5, sent: 5, skipped: 0, failed: 0, done: false })
      .mockResolvedValueOnce({ ok: false, processed: 0, sent: 0, skipped: 0, failed: 0, done: true, error: "occurrence_cancelled" });
    const { svc, calls } = createFakeSupabase((c) =>
      c.table === "admin_notification_campaigns" && c.single ? { data: campaignRow } : { data: [] }
    );
    const { drainNotificationCampaignSendBatches } = await import(
      "@/lib/admin/notification-campaigns/claim-scheduled-campaign"
    );
    const out = await drainNotificationCampaignSendBatches(svc as never, "occ-1");
    expect(out).toMatchObject({ ok: true, done: true, stopped: true, sent: 5, batches: 2 });
    expect(calls.filter((c) => c.op === "update")).toHaveLength(0);
  });

  it("scheduled occurrence with archived notice → skipped (cancelled + source_skipped reason), campaign cancelled, audit", async () => {
    getCampaignOccurrence.mockResolvedValue({
      id: "occ-1",
      campaign_id: "camp-1",
      status: "sending",
      trigger_type: "scheduled",
    });
    evaluateOfficialCampaignSendEligibility.mockResolvedValue({ ok: false, error: "content_source_unavailable" });
    const { svc, calls } = createFakeSupabase((c) => {
      if (c.table === "admin_notification_campaigns" && c.single && c.op === "select") {
        return { data: { ...campaignRow, status: "scheduled" } };
      }
      if (c.op === "update") return { data: [{ id: "x" }] };
      return { data: [] };
    });
    const { drainNotificationCampaignSendBatches } = await import(
      "@/lib/admin/notification-campaigns/claim-scheduled-campaign"
    );
    const out = await drainNotificationCampaignSendBatches(svc as never, "occ-1");
    expect(out).toMatchObject({
      ok: false,
      done: true,
      error: "content_source_unavailable",
      skippedReason: "source_skipped:content_source_unavailable",
    });
    expect(runNotificationCampaignSendBatch).not.toHaveBeenCalled();
    const occUpd = calls.find((c) => c.table === "admin_notification_campaign_occurrences" && c.op === "update");
    expect(occUpd?.payload).toMatchObject({
      status: "cancelled",
      last_error: "source_skipped:content_source_unavailable",
    });
    const campUpd = calls.find((c) => c.table === "admin_notification_campaigns" && c.op === "update");
    expect(campUpd?.payload).toMatchObject({ status: "cancelled" });
    expect(campUpd && hasFilter(campUpd, "in", "status", ["scheduled", "sending"])).toBe(true);
    const audit = calls.find((c) => c.table === "admin_notification_campaign_audit_logs");
    expect(audit?.payload).toMatchObject({ action: "source_skip", actor_id: null, from_status: "scheduled", to_status: "cancelled" });
  });

  it("recurring occurrence skip keeps the series active (no campaign status write)", async () => {
    getCampaignOccurrence.mockResolvedValue({
      id: "occ-2",
      campaign_id: "camp-1",
      status: "sending",
      trigger_type: "recurring",
    });
    evaluateOfficialCampaignSendEligibility.mockResolvedValue({ ok: false, error: "event_source_unpublished" });
    const { svc, calls } = createFakeSupabase((c) =>
      c.table === "admin_notification_campaigns" && c.single ? { data: campaignRow } : { data: [] }
    );
    const { drainNotificationCampaignSendBatches } = await import(
      "@/lib/admin/notification-campaigns/claim-scheduled-campaign"
    );
    const out = await drainNotificationCampaignSendBatches(svc as never, "occ-2");
    expect(out.skippedReason).toBe("source_skipped:event_source_unpublished");
    expect(calls.filter((c) => c.table === "admin_notification_campaigns" && c.op === "update")).toHaveLength(0);
  });

  it("manual immediate occurrence keeps the existing failure semantics", async () => {
    getCampaignOccurrence.mockResolvedValue({ id: "occ-3", campaign_id: "camp-1", status: "sending", trigger_type: "immediate" });
    evaluateOfficialCampaignSendEligibility.mockResolvedValue({ ok: false, error: "content_source_unavailable" });
    const { svc, calls } = createFakeSupabase((c) =>
      c.table === "admin_notification_campaigns" && c.single ? { data: campaignRow } : { data: [] }
    );
    const { drainNotificationCampaignSendBatches } = await import(
      "@/lib/admin/notification-campaigns/claim-scheduled-campaign"
    );
    const out = await drainNotificationCampaignSendBatches(svc as never, "occ-3");
    expect(out.skippedReason).toBeUndefined();
    const occUpd = calls.find((c) => c.table === "admin_notification_campaign_occurrences" && c.op === "update");
    expect(occUpd?.payload).toMatchObject({ status: "failed", last_error: "content_source_unavailable" });
  });
});
