import { beforeEach, describe, expect, it, vi } from "vitest";
import { NextResponse } from "next/server";
import { createFakeSupabase, type FakeCall } from "@/lib/admin/notification-campaigns/__tests__/fake-supabase-recorder";

const requireAdminApiUser = vi.fn();
const tryCreateSupabaseServiceClient = vi.fn();

vi.mock("@/lib/admin/require-admin-api", () => ({
  requireAdminApiUser: () => requireAdminApiUser(),
}));
vi.mock("@/lib/supabase/try-supabase-server", () => ({
  tryCreateSupabaseServiceClient: () => tryCreateSupabaseServiceClient(),
}));

function jsonReq(url: string, method: string, body: unknown) {
  return new Request(url, {
    method,
    headers: { "content-type": "application/json", "x-forwarded-for": "7.7.7.7" },
    body: JSON.stringify(body),
  }) as never;
}

function svcWithCampaign(row: Record<string, unknown>, occurrences: Array<Record<string, unknown>> = []) {
  return createFakeSupabase((c: FakeCall) => {
    if (c.table === "admin_notification_campaigns" && c.op === "select" && c.single) return { data: row };
    if (c.table === "admin_notification_campaign_occurrences" && c.op === "select") return { data: occurrences };
    if (c.op === "update" || c.op === "insert") return { data: [{ id: "new-1" }] };
    return { data: [] };
  });
}

const forbidden = () => ({
  ok: false,
  response: NextResponse.json({ ok: false, error: "forbidden" }, { status: 403 }),
});

describe("WP1 CMS routes", () => {
  beforeEach(() => {
    vi.resetModules();
    requireAdminApiUser.mockReset();
    tryCreateSupabaseServiceClient.mockReset();
  });

  it("every mutating CMS route requires admin", async () => {
    requireAdminApiUser.mockResolvedValue(forbidden());
    const ctx = { params: Promise.resolve({ campaignId: "c1" }) };
    const detail = await import("@/app/api/admin/notification-campaigns/[campaignId]/route");
    const actions = await import("@/app/api/admin/notification-campaigns/[campaignId]/actions/route");
    const cancel = await import("@/app/api/admin/notification-campaigns/occurrences/[occurrenceId]/cancel/route");
    expect((await detail.PATCH(jsonReq("https://x/api", "PATCH", { title: "t" }), ctx)).status).toBe(403);
    expect((await actions.POST(jsonReq("https://x/api", "POST", { action: "archive" }), ctx)).status).toBe(403);
    expect(
      (await cancel.POST(jsonReq("https://x/api", "POST", {}), { params: Promise.resolve({ occurrenceId: "o1" }) }))
        .status
    ).toBe(403);
    expect(tryCreateSupabaseServiceClient).not.toHaveBeenCalled();
  });

  it("PATCH rejects illegal status change via the transition table (scheduled → draft)", async () => {
    requireAdminApiUser.mockResolvedValue({ ok: true, userId: "admin-1" });
    const { svc, calls } = svcWithCampaign({ id: "c1", status: "scheduled", send_mode: "scheduled" });
    tryCreateSupabaseServiceClient.mockReturnValue(svc);
    const { PATCH } = await import("@/app/api/admin/notification-campaigns/[campaignId]/route");
    const res = await PATCH(jsonReq("https://x/api", "PATCH", { status: "draft" }), {
      params: Promise.resolve({ campaignId: "c1" }),
    });
    expect(res.status).toBe(409);
    expect(await res.json()).toMatchObject({ error: "illegal_status_transition", from: "scheduled", to: "draft" });
    expect(calls.filter((c) => c.op === "update")).toHaveLength(0);
  });

  it("PATCH content on a sent campaign → 409 (duplicate only)", async () => {
    requireAdminApiUser.mockResolvedValue({ ok: true, userId: "admin-1" });
    const { svc } = svcWithCampaign({
      id: "c1",
      status: "sent",
      send_mode: "immediate",
      title: "a",
      body: "b",
      type: "marketing",
      target_type: "all",
      channel: "push_only",
      deeplink_url: "/events/e1",
      target_payload: { platform_event_id: "e1" },
    });
    tryCreateSupabaseServiceClient.mockReturnValue(svc);
    const { PATCH } = await import("@/app/api/admin/notification-campaigns/[campaignId]/route");
    const res = await PATCH(jsonReq("https://x/api", "PATCH", { title: "changed" }), {
      params: Promise.resolve({ campaignId: "c1" }),
    });
    expect(res.status).toBe(409);
    expect(await res.json()).toMatchObject({ error: "campaign_not_editable" });
  });

  it("PATCH validates links with the campaign link rules (external host not allowlisted)", async () => {
    requireAdminApiUser.mockResolvedValue({ ok: true, userId: "admin-1" });
    const { svc, calls } = svcWithCampaign({
      id: "c1",
      status: "draft",
      send_mode: "immediate",
      title: "a",
      body: "b",
      type: "marketing",
      target_type: "all",
      channel: "push_only",
      deeplink_url: "/events/e1",
      target_payload: {},
    });
    tryCreateSupabaseServiceClient.mockReturnValue(svc);
    const { PATCH } = await import("@/app/api/admin/notification-campaigns/[campaignId]/route");
    const res = await PATCH(jsonReq("https://x/api", "PATCH", { web_url: "https://evil.example.com/x" }), {
      params: Promise.resolve({ campaignId: "c1" }),
    });
    expect(res.status).toBe(400);
    expect(await res.json()).toMatchObject({ error: "external_url_not_allowed" });
    expect(calls.filter((c) => c.op === "update")).toHaveLength(0);
  });

  it("actions route rejects unknown / send-path actions", async () => {
    requireAdminApiUser.mockResolvedValue({ ok: true, userId: "admin-1" });
    tryCreateSupabaseServiceClient.mockReturnValue(svcWithCampaign({ id: "c1", status: "draft" }).svc);
    const { POST } = await import("@/app/api/admin/notification-campaigns/[campaignId]/actions/route");
    for (const action of ["send", "resend", "edit", "nope"]) {
      const res = await POST(jsonReq("https://x/api", "POST", { action }), {
        params: Promise.resolve({ campaignId: "c1" }),
      });
      expect(res.status).toBe(400);
    }
  });

  it("archive writes archived_at and an audit row with actor + ip", async () => {
    requireAdminApiUser.mockResolvedValue({ ok: true, userId: "admin-1" });
    const { svc, calls } = svcWithCampaign({ id: "c1", status: "sent", send_mode: "immediate", archived_at: null });
    tryCreateSupabaseServiceClient.mockReturnValue(svc);
    const { POST } = await import("@/app/api/admin/notification-campaigns/[campaignId]/actions/route");
    const res = await POST(jsonReq("https://x/api", "POST", { action: "archive" }), {
      params: Promise.resolve({ campaignId: "c1" }),
    });
    expect(res.status).toBe(200);
    const upd = calls.find((c) => c.table === "admin_notification_campaigns" && c.op === "update");
    expect(upd?.payload).toMatchObject({ archived_by: "admin-1" });
    const audit = calls.find((c) => c.table === "admin_notification_campaign_audit_logs");
    expect(audit?.payload).toMatchObject({ action: "archive", actor_id: "admin-1", ip: "7.7.7.7", campaign_id: "c1" });
  });

  it("archive before the migration → 503 archive_migration_pending; audit failure never fails an action", async () => {
    requireAdminApiUser.mockResolvedValue({ ok: true, userId: "admin-1" });
    const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
    const archiveMissing = createFakeSupabase((c) => {
      if (c.table === "admin_notification_campaigns" && c.op === "select" && c.single) {
        return { data: { id: "c1", status: "sent" } };
      }
      if (c.table === "admin_notification_campaigns" && c.op === "update") {
        return { error: { code: "42703", message: 'column "archived_at" does not exist' } };
      }
      return { data: [] };
    });
    tryCreateSupabaseServiceClient.mockReturnValue(archiveMissing.svc);
    const { POST } = await import("@/app/api/admin/notification-campaigns/[campaignId]/actions/route");
    const res = await POST(jsonReq("https://x/api", "POST", { action: "archive" }), {
      params: Promise.resolve({ campaignId: "c1" }),
    });
    expect(res.status).toBe(503);
    expect(await res.json()).toMatchObject({ error: "archive_migration_pending" });

    // duplicate succeeds even when the audit table is missing
    const auditMissing = createFakeSupabase((c) => {
      if (c.table === "admin_notification_campaigns" && c.op === "select" && c.single) {
        return { data: { id: "c1", status: "sent", title: "t" } };
      }
      if (c.table === "admin_notification_campaign_audit_logs") {
        return { error: { code: "42P01", message: "relation does not exist" } };
      }
      if (c.op === "insert") return { data: { id: "dup-1" } };
      return { data: [] };
    });
    tryCreateSupabaseServiceClient.mockReturnValue(auditMissing.svc);
    const res2 = await POST(jsonReq("https://x/api", "POST", { action: "duplicate" }), {
      params: Promise.resolve({ campaignId: "c1" }),
    });
    expect(res2.status).toBe(200);
    expect(await res2.json()).toMatchObject({ ok: true, id: "dup-1", source_campaign_id: "c1" });
    expect(warn).toHaveBeenCalled();
    warn.mockRestore();
  });

  it("occurrence cancel on a scheduled campaign records 「취소됨」 (cancelled), not draft", async () => {
    requireAdminApiUser.mockResolvedValue({ ok: true, userId: "admin-1" });
    const { svc, calls } = createFakeSupabase((c) => {
      if (c.table === "admin_notification_campaign_occurrences" && c.op === "select" && c.single) {
        return { data: { campaign_id: "c1" } };
      }
      if (c.table === "admin_notification_campaigns" && c.op === "select" && c.single) {
        return { data: { id: "c1", status: "scheduled", send_mode: "scheduled" } };
      }
      if (c.table === "admin_notification_campaign_occurrences" && c.op === "select") {
        return {
          data: [
            { id: "o1", status: "queued", trigger_type: "scheduled", scheduled_for: null, sequence_number: 1, target_member_count: 4 },
          ],
        };
      }
      if (c.op === "update" || c.op === "insert") return { data: [{ id: "o1" }] };
      return { data: [] };
    });
    tryCreateSupabaseServiceClient.mockReturnValue(svc);
    const { POST } = await import("@/app/api/admin/notification-campaigns/occurrences/[occurrenceId]/cancel/route");
    const res = await POST(jsonReq("https://x/api", "POST", {}), { params: Promise.resolve({ occurrenceId: "o1" }) });
    expect(res.status).toBe(200);
    expect(await res.json()).toMatchObject({ ok: true, campaign_status: "cancelled" });
    const campUpd = calls.find((c) => c.table === "admin_notification_campaigns" && c.op === "update");
    expect(campUpd?.payload).toMatchObject({ status: "cancelled" });
    const audit = calls.find((c) => c.table === "admin_notification_campaign_audit_logs");
    expect(audit?.payload).toMatchObject({ action: "cancel", from_status: "scheduled", to_status: "cancelled", target_count: 4 });
  });
});
