import { describe, expect, it, vi } from "vitest";

vi.mock("@/lib/admin/notification-campaigns/campaign-audience-preview", () => ({
  previewCampaignAudience: vi.fn(async () => ({
    totalUsers: 3,
    eligibleUsers: 3,
    pushEligibleUsers: 2,
    inAppEligibleUsers: 3,
    activeDevices: 2,
    androidDevices: 1,
    iosDevices: 1,
    webDevices: 0,
    excludedNoDevice: 0,
    excludedOptOut: 0,
    excludedInvalidTarget: 0,
    truncated: false,
    segmentUnsupported: false,
  })),
}));

import {
  buildCampaignActionContext,
  buildDuplicateCampaignRow,
  cancelCampaignReservation,
  editCampaign,
  stopRecurringCampaign,
  stopSendingCampaign,
  validateCampaignEditFields,
  type CampaignOccurrenceFact,
  type LoadedCampaign,
} from "@/lib/admin/notification-campaigns/campaign-lifecycle-service";
import type { CampaignWriteFields } from "@/lib/admin/notification-campaigns/campaign-input";
import {
  createFakeSupabase,
  hasFilter,
  type FakeCall,
} from "@/lib/admin/notification-campaigns/__tests__/fake-supabase-recorder";

function occ(partial: Partial<CampaignOccurrenceFact>): CampaignOccurrenceFact {
  return {
    id: "occ-1",
    status: "queued",
    trigger_type: "scheduled",
    scheduled_for: "2099-01-01T00:00:00.000Z",
    sequence_number: 1,
    target_member_count: 5,
    ...partial,
  };
}

function loaded(row: Record<string, unknown>, occurrences: CampaignOccurrenceFact[]): LoadedCampaign {
  const full = { id: "camp-1", channel: "push_and_in_app", ...row };
  return { row: full, occurrences, ctx: buildCampaignActionContext(full, occurrences) };
}

/** Every update returns one affected row unless overridden. */
function okSvc(override?: (c: FakeCall) => { data?: unknown; error?: { message: string } | null } | undefined) {
  return createFakeSupabase((c) => {
    const o = override?.(c);
    if (o) return o;
    if (c.op === "update" || c.op === "insert") return { data: [{ id: "row-1" }] };
    return { data: [] };
  });
}

const campaignUpdates = (calls: FakeCall[]) =>
  calls.filter((c) => c.table === "admin_notification_campaigns" && c.op === "update");
const occurrenceUpdates = (calls: FakeCall[]) =>
  calls.filter((c) => c.table === "admin_notification_campaign_occurrences" && c.op === "update");

describe("ADM-03 cancel reservation", () => {
  it("scheduled one-shot → occurrence + campaign 'cancelled' (not draft)", async () => {
    const { svc, calls } = okSvc();
    const l = loaded({ status: "scheduled", send_mode: "scheduled" }, [occ({})]);
    const out = await cancelCampaignReservation(svc as never, l, "admin-1", { occurrenceId: "occ-1" });
    expect(out).toMatchObject({ ok: true, action: "cancel", fromStatus: "scheduled", toStatus: "cancelled" });
    const occUpd = occurrenceUpdates(calls)[0];
    expect(occUpd.payload).toMatchObject({ status: "cancelled", cancelled_by: "admin-1", last_error: "cancelled_by_admin" });
    expect(hasFilter(occUpd, "in", "status", ["queued"])).toBe(true);
    expect(hasFilter(occUpd, "neq", "trigger_type", "test")).toBe(true);
    const campUpd = campaignUpdates(calls)[0];
    expect(campUpd.payload).toMatchObject({ status: "cancelled", cancelled_by: "admin-1" });
    expect(hasFilter(campUpd, "eq", "status", "scheduled")).toBe(true);
    expect(JSON.stringify(calls)).not.toContain('"status":"draft"');
  });

  it("recurring: only that slot is cancelled; campaign status untouched", async () => {
    const { svc, calls } = okSvc();
    const l = loaded({ status: "active", send_mode: "recurring" }, [occ({ trigger_type: "recurring" })]);
    const out = await cancelCampaignReservation(svc as never, l, "admin-1", { occurrenceId: "occ-1" });
    expect(out).toMatchObject({ ok: true, fromStatus: "active", toStatus: "active" });
    expect(campaignUpdates(calls)).toHaveLength(0);
    expect(hasFilter(occurrenceUpdates(calls)[0], "in", "id", ["occ-1"])).toBe(true);
  });

  it("rejects a non-queued occurrence and a sending campaign", async () => {
    const { svc } = okSvc();
    const sent = loaded({ status: "scheduled", send_mode: "scheduled" }, [occ({ status: "sent" })]);
    expect(await cancelCampaignReservation(svc as never, sent, "a", { occurrenceId: "occ-1" })).toMatchObject({
      ok: false,
      error: "occurrence_not_cancellable",
    });
    const sending = loaded({ status: "sending", send_mode: "immediate" }, [occ({ trigger_type: "immediate" })]);
    expect(await cancelCampaignReservation(svc as never, sending, "a", { occurrenceId: "occ-1" })).toMatchObject({
      ok: false,
      error: "use_stop_sending",
    });
  });

  it("concurrent status change → 409 campaign_status_changed", async () => {
    const { svc } = okSvc((c) =>
      c.table === "admin_notification_campaigns" && c.op === "update" ? { data: [] } : undefined
    );
    const l = loaded({ status: "scheduled", send_mode: "scheduled" }, [occ({})]);
    expect(await cancelCampaignReservation(svc as never, l, "a")).toMatchObject({
      ok: false,
      status: 409,
      error: "campaign_status_changed",
    });
  });
});

describe("ADM-03 stop", () => {
  it("stop sending: campaign sending→cancelled first, then queued+sending occurrences cancelled", async () => {
    const { svc, calls } = okSvc();
    const l = loaded({ status: "sending", send_mode: "immediate" }, [occ({ status: "sending", trigger_type: "immediate" })]);
    const out = await stopSendingCampaign(svc as never, l, "admin-1");
    expect(out).toMatchObject({ ok: true, action: "stop_sending", toStatus: "cancelled" });
    const updates = calls.filter((c) => c.op === "update");
    expect(updates[0].table).toBe("admin_notification_campaigns");
    expect(hasFilter(updates[0], "eq", "status", "sending")).toBe(true);
    const occUpd = occurrenceUpdates(calls)[0];
    expect(hasFilter(occUpd, "in", "status", ["queued", "sending"])).toBe(true);
    expect(occUpd.payload).toMatchObject({ status: "cancelled", last_error: "stopped_by_admin", send_claim_token: null });
  });

  it("stop sending is refused unless the campaign is sending", async () => {
    const { svc, calls } = okSvc();
    const l = loaded({ status: "scheduled", send_mode: "scheduled" }, [occ({})]);
    expect(await stopSendingCampaign(svc as never, l, "a")).toMatchObject({ ok: false, status: 409 });
    expect(calls.filter((c) => c.op === "update")).toHaveLength(0);
  });

  it("stop recurring: paused → ended and planned slots cancelled", async () => {
    const { svc, calls } = okSvc();
    const l = loaded({ status: "paused", send_mode: "recurring" }, [occ({ trigger_type: "recurring" })]);
    const out = await stopRecurringCampaign(svc as never, l, "admin-1");
    expect(out).toMatchObject({ ok: true, fromStatus: "paused", toStatus: "ended" });
    expect(campaignUpdates(calls)[0].payload).toMatchObject({ status: "ended" });
    expect(occurrenceUpdates(calls)[0].payload).toMatchObject({ status: "cancelled", last_error: "series_stopped" });
  });
});

const baseFields: CampaignWriteFields = {
  title: "새 제목",
  body: "본문",
  type: "marketing",
  target_type: "selected_users",
  channel: "push_and_in_app",
  deeplink_url: "/events/e1",
  web_url: null,
  push_image_url: null,
  in_app_image_url: null,
  segment_region_code: null,
  target_payload: { platform_event_id: "e1" },
  send_mode: "scheduled",
  scheduled_at: "2099-02-01T00:00:00.000Z",
  recurrence_time: null,
  recurrence_start_at: null,
  recurrence_end_at: null,
  recurrence_max_count: null,
  recurrence_weekday: null,
  target_user_ids: ["u1", "u2"],
};

describe("ADM-04 edit", () => {
  it("rejects after sending (duplicate only)", async () => {
    const { svc, calls } = okSvc();
    for (const status of ["sending", "sent", "partially_failed", "failed", "cancelled"]) {
      const l = loaded({ status, send_mode: "immediate" }, []);
      expect(await editCampaign(svc as never, l, "a", baseFields)).toMatchObject({
        ok: false,
        status: 409,
        error: "campaign_not_editable",
      });
    }
    expect(calls).toHaveLength(0);
  });

  it("scheduled edit updates the row (status guard) and regenerates the queued snapshot + time + targets", async () => {
    const { svc, calls } = okSvc();
    const l = loaded({ status: "scheduled", send_mode: "scheduled", title: "old" }, [occ({})]);
    const out = await editCampaign(svc as never, l, "admin-1", baseFields);
    expect(out).toMatchObject({ ok: true, action: "edit", fromStatus: "scheduled", toStatus: "scheduled" });
    const campUpd = campaignUpdates(calls)[0];
    expect(hasFilter(campUpd, "eq", "status", "scheduled")).toBe(true);
    expect(campUpd.payload).toMatchObject({
      title: "새 제목",
      scheduled_at: "2099-02-01T00:00:00.000Z",
      target_payload: { platform_event_id: "e1", selected_user_ids: ["u1", "u2"] },
      target_count: 2,
    });
    const occUpd = occurrenceUpdates(calls)[0];
    expect(occUpd.payload).toMatchObject({
      scheduled_for: "2099-02-01T00:00:00.000Z",
      target_member_count: 3,
      content_snapshot: expect.objectContaining({ title: "새 제목" }),
    });
    expect(hasFilter(occUpd, "eq", "status", "queued")).toBe(true);
    const del = calls.find((c) => c.table === "admin_notification_campaign_targets" && c.op === "delete");
    expect(del && hasFilter(del, "eq", "status", "pending")).toBe(true);
    const upsert = calls.find((c) => c.table === "admin_notification_campaign_targets" && c.op === "upsert");
    expect((upsert?.payload as Array<{ user_id: string }>).map((r) => r.user_id)).toEqual(["u1", "u2"]);
  });

  it("scheduled edit cannot move the time into the past or switch send mode", async () => {
    const { svc } = okSvc();
    const l = loaded({ status: "scheduled", send_mode: "scheduled" }, [occ({})]);
    expect(
      await editCampaign(svc as never, l, "a", { ...baseFields, scheduled_at: "2001-01-01T00:00:00.000Z" })
    ).toMatchObject({ ok: false, status: 400, error: "scheduled_at_must_be_future" });
    expect(await editCampaign(svc as never, l, "a", { ...baseFields, send_mode: "immediate" })).toMatchObject({
      ok: false,
      error: "send_mode_locked",
    });
  });

  it("paused recurring edit supersedes the planned slot instead of regenerating it", async () => {
    const { svc, calls } = okSvc();
    const l = loaded({ status: "paused", send_mode: "recurring" }, [occ({ trigger_type: "recurring" })]);
    const out = await editCampaign(svc as never, l, "a", {
      ...baseFields,
      send_mode: "recurring",
      recurrence_kind: "weekly",
    });
    expect(out.ok).toBe(true);
    expect(occurrenceUpdates(calls)[0].payload).toMatchObject({ status: "cancelled", last_error: "superseded_by_edit" });
  });

  it("validateCampaignEditFields", () => {
    const now = Date.parse("2050-01-01T00:00:00Z");
    expect(validateCampaignEditFields("draft", { send_mode: "immediate", scheduled_at: null }, now).ok).toBe(true);
    expect(
      validateCampaignEditFields("scheduled", { send_mode: "scheduled", scheduled_at: "2049-12-31T00:00:00Z" }, now)
    ).toEqual({ ok: false, error: "scheduled_at_must_be_future" });
    expect(validateCampaignEditFields("paused", { send_mode: "scheduled", scheduled_at: null }, now)).toEqual({
      ok: false,
      error: "send_mode_locked",
    });
    expect(
      validateCampaignEditFields("draft", { send_mode: "recurring", scheduled_at: null, recurrence_kind: "none" }, now)
    ).toEqual({ ok: false, error: "recurrence_kind_required" });
  });
});

describe("duplicate", () => {
  it("copies content only and starts as a fresh draft", () => {
    const row = buildDuplicateCampaignRow(
      {
        id: "src",
        title: "T",
        body: "B",
        type: "notice",
        target_type: "selected_users",
        channel: "push_only",
        target_payload: { selected_user_ids: ["a", "b", "c"], content_id: "n1" },
        status: "sent",
        sent_count: 99,
        create_request_id: "idem",
        archived_at: "2027-01-01",
        is_qa: false,
      },
      "admin-2",
      "2027-01-01T00:00:00.000Z"
    );
    expect(row).toMatchObject({
      title: "T",
      status: "draft",
      send_mode: "immediate",
      sent_count: 0,
      target_count: 3,
      created_by: "admin-2",
    });
    expect(row).not.toHaveProperty("id");
    expect(row).not.toHaveProperty("create_request_id");
    expect(row).not.toHaveProperty("archived_at");
  });
});
