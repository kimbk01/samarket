import { afterEach, describe, expect, it, vi } from "vitest";
import {
  CAMPAIGN_AUDIT_TABLE,
  campaignAuditSnapshot,
  isMissingRelationError,
  readAuditRequestIp,
  writeCampaignAuditLog,
} from "@/lib/admin/notification-campaigns/campaign-audit-log";
import { createFakeSupabase } from "@/lib/admin/notification-campaigns/__tests__/fake-supabase-recorder";

const entry = {
  actorId: "admin-1",
  campaignId: "camp-1",
  action: "cancel" as const,
  fromStatus: "scheduled",
  toStatus: "cancelled",
  targetCount: 12.7,
  ip: "1.2.3.4",
};

describe("writeCampaignAuditLog tolerance", () => {
  afterEach(() => vi.restoreAllMocks());

  it("writes one row with normalized fields", async () => {
    const { svc, calls } = createFakeSupabase(() => ({ data: null }));
    const out = await writeCampaignAuditLog(svc as never, entry);
    expect(out).toEqual({ ok: true });
    expect(calls).toHaveLength(1);
    expect(calls[0].table).toBe(CAMPAIGN_AUDIT_TABLE);
    expect(calls[0].op).toBe("insert");
    expect(calls[0].payload).toMatchObject({
      actor_id: "admin-1",
      campaign_id: "camp-1",
      action: "cancel",
      from_status: "scheduled",
      to_status: "cancelled",
      target_count: 12,
      ip: "1.2.3.4",
    });
  });

  it("missing table (migration not applied) → warning, never throws", async () => {
    const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
    const { svc } = createFakeSupabase(() => ({
      error: { code: "42P01", message: 'relation "public.admin_notification_campaign_audit_logs" does not exist' },
    }));
    const out = await writeCampaignAuditLog(svc as never, entry);
    expect(out).toMatchObject({ ok: false, reason: "table_missing" });
    expect(warn).toHaveBeenCalled();
  });

  it("missing column via PostgREST schema cache → table_missing", async () => {
    vi.spyOn(console, "warn").mockImplementation(() => {});
    const { svc } = createFakeSupabase(() => ({
      error: { code: "PGRST204", message: "Could not find the 'ip' column of 'admin_notification_campaign_audit_logs' in the schema cache" },
    }));
    expect(await writeCampaignAuditLog(svc as never, entry)).toMatchObject({ ok: false, reason: "table_missing" });
  });

  it("other insert errors → insert_failed (still no throw)", async () => {
    vi.spyOn(console, "warn").mockImplementation(() => {});
    const { svc } = createFakeSupabase(() => ({ error: { code: "23503", message: "fk violation" } }));
    expect(await writeCampaignAuditLog(svc as never, entry)).toMatchObject({ ok: false, reason: "insert_failed" });
  });

  it("client throwing → exception result", async () => {
    vi.spyOn(console, "warn").mockImplementation(() => {});
    const svc = {
      from: () => {
        throw new Error("network down");
      },
    };
    expect(await writeCampaignAuditLog(svc as never, entry)).toMatchObject({ ok: false, reason: "exception" });
  });
});

describe("audit helpers", () => {
  it("isMissingRelationError", () => {
    expect(isMissingRelationError({ code: "42703", message: "column archived_at does not exist" })).toBe(true);
    expect(isMissingRelationError({ code: "PGRST205", message: "x" })).toBe(true);
    expect(isMissingRelationError({ code: "23505", message: "duplicate key" })).toBe(false);
    expect(isMissingRelationError(null)).toBe(false);
  });

  it("readAuditRequestIp prefers the first forwarded hop", () => {
    expect(readAuditRequestIp(new Headers({ "x-forwarded-for": "9.9.9.9, 10.0.0.1" }))).toBe("9.9.9.9");
    expect(readAuditRequestIp(new Headers({ "x-real-ip": "8.8.8.8" }))).toBe("8.8.8.8");
    expect(readAuditRequestIp(new Headers())).toBeNull();
    expect(readAuditRequestIp(null)).toBeNull();
  });

  it("snapshot keeps campaign fields and summarizes selected users", () => {
    const snap = campaignAuditSnapshot({
      status: "draft",
      title: "t",
      send_progress_offset: 99,
      target_payload: { selected_user_ids: ["a", "b"], content_id: "n1" },
    });
    expect(snap).toEqual({
      status: "draft",
      title: "t",
      target_payload: { content_id: "n1", selected_user_count: 2 },
    });
  });
});
