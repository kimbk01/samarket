/**
 * U2 — EVENT-01 (draft send creates occurrence from current content), EVENT-12 / EVENT-09
 * (manual send never claims test or not-yet-due occurrences), EVENT-02 (Event save refreshes
 * unsent draft content; sent campaigns immutable; send gated on saved state).
 */
import { describe, expect, it, vi } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";

vi.mock("@/lib/admin/notification-campaigns/campaign-audience-preview", () => ({
  previewCampaignAudience: vi.fn(async () => ({
    totalUsers: 10, eligibleUsers: 10, pushEligibleUsers: 7, inAppEligibleUsers: 10,
    activeDevices: 8, androidDevices: 5, iosDevices: 3, webDevices: 0,
  })),
}));

import {
  ensureDraftCampaignSendOccurrence,
  isManualSendableOccurrence,
  resolveActiveOccurrenceForSend,
} from "@/lib/admin/notification-campaigns/campaign-create-service";
import { updateUnsentDraftCampaignContent } from "@/lib/admin/notification-campaigns/campaign-draft-content";

const HOUR = 3_600_000;
const iso = (d: number) => new Date(Date.now() + d).toISOString();

/** Minimal chainable fake: per-table terminal results. */
function fakeSvc(handlers: {
  occList?: unknown[];
  occSingle?: unknown;
  campaign?: unknown;
  campaignError?: unknown;
  nextSeq?: number;
  rpc?: (name: string, args: Record<string, unknown>) => unknown;
  updateResult?: { data: unknown; error: unknown };
  /** existing non-test occurrence probe (`.neq("trigger_type","test").limit(1)`) */
  realOccList?: unknown[];
  realOccError?: unknown;
}) {
  const calls: Array<{ table: string; op: string; args: unknown[] }> = [];
  const from = vi.fn((table: string) => {
    const chain: Record<string, unknown> = {};
    let awaitedLimit1 = false;
    const rec = (op: string) => (...args: unknown[]) => {
      calls.push({ table, op, args });
      return chain;
    };
    for (const op of ["select", "eq", "neq", "in", "order", "update"]) chain[op] = rec(op);
    chain.upsert = (...args: unknown[]) => {
      calls.push({ table, op: "upsert", args });
      return Promise.resolve({ data: [], error: null });
    };
    chain.limit = (...args: unknown[]) => {
      calls.push({ table, op: "limit", args });
      if (table === "admin_notification_campaign_occurrences" && args[0] === 20) {
        return Promise.resolve({ data: handlers.occList ?? [], error: null });
      }
      // `.limit(1)` that is awaited directly (no maybeSingle) = existing real occurrence probe.
      if (table === "admin_notification_campaign_occurrences" && args[0] === 1) awaitedLimit1 = true;
      return chain;
    };
    chain.maybeSingle = async () => {
      if (table === "admin_notification_campaigns") {
        return { data: handlers.campaign ?? null, error: handlers.campaignError ?? null };
      }
      if (calls.some((c) => c.table === table && c.op === "order" && c.args[0] === "sequence_number")) {
        return { data: handlers.nextSeq != null ? { sequence_number: handlers.nextSeq - 1 } : null, error: null };
      }
      return { data: handlers.occSingle ?? null, error: null };
    };
    chain.then = (resolve: (v: unknown) => void) =>
      resolve(
        awaitedLimit1
          ? { data: handlers.realOccList ?? [], error: handlers.realOccError ?? null }
          : (handlers.updateResult ?? { data: [], error: null })
      );
    return chain;
  });
  const rpc = vi.fn(async (name: string, args: Record<string, unknown>) => ({
    data: handlers.rpc?.(name, args) ?? { id: "occ-new" },
    error: null,
  }));
  return { svc: { from, rpc } as never, calls, rpc };
}

describe("EVENT-12 / EVENT-09 manual send occurrence selection", () => {
  it("isManualSendableOccurrence", () => {
    expect(isManualSendableOccurrence({ trigger_type: "immediate", scheduled_for: null })).toBe(true);
    expect(isManualSendableOccurrence({ trigger_type: "test" })).toBe(false);
    expect(isManualSendableOccurrence({ trigger_type: "scheduled", scheduled_for: iso(HOUR) })).toBe(false);
    expect(isManualSendableOccurrence({ trigger_type: "recurring", scheduled_for: iso(HOUR) })).toBe(false);
    expect(isManualSendableOccurrence({ trigger_type: "scheduled", scheduled_for: iso(-HOUR) })).toBe(true);
  });

  it("latest: skips test and future occurrences", async () => {
    const { svc } = fakeSvc({
      occList: [
        { id: "t1", trigger_type: "test" },
        { id: "f1", trigger_type: "scheduled", scheduled_for: iso(HOUR) },
        { id: "ok", trigger_type: "immediate", scheduled_for: null },
      ],
    });
    expect(await resolveActiveOccurrenceForSend(svc, "c1")).toBe("ok");
  });

  it("latest: only test occurrences → null", async () => {
    const { svc } = fakeSvc({ occList: [{ id: "t1", trigger_type: "test" }] });
    expect(await resolveActiveOccurrenceForSend(svc, "c1")).toBeNull();
  });

  it("explicit: must belong to campaign and be sendable", async () => {
    const other = fakeSvc({ occSingle: { id: "o1", campaign_id: "other", trigger_type: "immediate" } });
    expect(await resolveActiveOccurrenceForSend(other.svc, "c1", "o1")).toBeNull();
    const test = fakeSvc({ occSingle: { id: "o1", campaign_id: "c1", trigger_type: "test" } });
    expect(await resolveActiveOccurrenceForSend(test.svc, "c1", "o1")).toBeNull();
    const future = fakeSvc({ occSingle: { id: "o1", campaign_id: "c1", trigger_type: "scheduled", scheduled_for: iso(HOUR) } });
    expect(await resolveActiveOccurrenceForSend(future.svc, "c1", "o1")).toBeNull();
    const ok = fakeSvc({ occSingle: { id: "o1", campaign_id: "c1", trigger_type: "immediate" } });
    expect(await resolveActiveOccurrenceForSend(ok.svc, "c1", "o1")).toBe("o1");
  });
});

describe("EVENT-01 draft send occurrence", () => {
  const draft = {
    id: "c1", status: "draft", title: "Now title", body: "Now body", type: "marketing",
    channel: "push_only", target_type: "all", segment_region_code: null,
    deeplink_url: "/events/e1", web_url: "/events/e1", push_image_url: null, in_app_image_url: null,
    target_payload: { platform_event_id: "e1" },
  };

  it("draft → immediate occurrence from CURRENT content, next sequence, keyed idempotency", async () => {
    const { svc, rpc } = fakeSvc({ campaign: draft, nextSeq: 3 });
    const r = await ensureDraftCampaignSendOccurrence(svc, { campaignId: "c1", adminUserId: "a1", idempotencyKey: "k1" });
    expect(r).toEqual({ ok: true, occurrenceId: "occ-new" });
    const args = rpc.mock.calls[0]![1] as Record<string, unknown>;
    expect(args).toMatchObject({
      p_campaign_id: "c1",
      p_sequence_number: 3,
      p_trigger_type: "immediate",
      p_scheduled_for: null,
      p_idempotency_key: "draft-send:k1",
      p_triggered_by: "a1",
    });
    expect(args.p_content_snapshot).toMatchObject({ title: "Now title", body: "Now body" });
  });

  it.each([["sent"], ["scheduled"], ["active"], ["failed"]])("non-draft (%s) → 404 occurrence_not_found", async (status) => {
    const { svc, rpc } = fakeSvc({ campaign: { ...draft, status } });
    const r = await ensureDraftCampaignSendOccurrence(svc, { campaignId: "c1", adminUserId: "a1", idempotencyKey: "k" });
    expect(r).toEqual({ ok: false, error: "occurrence_not_found", status: 404 });
    expect(rpc).not.toHaveBeenCalled();
  });

  it("selected_users draft without selected_user_ids → 409, no occurrence", async () => {
    const { svc, rpc } = fakeSvc({ campaign: { ...draft, target_type: "selected_users", target_payload: {} } });
    const r = await ensureDraftCampaignSendOccurrence(svc, { campaignId: "c1", adminUserId: "a1", idempotencyKey: "k" });
    expect(r).toEqual({ ok: false, error: "draft_selected_users_targets_missing", status: 409 });
    expect(rpc).not.toHaveBeenCalled();
  });

  it("DEF-03: selected_users draft with selected_user_ids → occurrence + targets", async () => {
    const { svc, rpc } = fakeSvc({
      campaign: {
        ...draft,
        target_type: "selected_users",
        target_payload: { selected_user_ids: ["u-qa-1"] },
      },
      nextSeq: 1,
    });
    const r = await ensureDraftCampaignSendOccurrence(svc, {
      campaignId: "c1",
      adminUserId: "a1",
      idempotencyKey: "k-sel",
    });
    expect(r).toEqual({ ok: true, occurrenceId: "occ-new" });
    expect(rpc).toHaveBeenCalled();
  });

  it.each([["sending"], ["sent"], ["partially_failed"], ["cancelled"]])(
    "draft with an existing real occurrence (%s) → 409, never a second real occurrence (no double send)",
    async () => {
      const { svc, rpc, calls } = fakeSvc({ campaign: draft, realOccList: [{ id: "o1" }] });
      const r = await ensureDraftCampaignSendOccurrence(svc, { campaignId: "c1", adminUserId: "a1", idempotencyKey: "k2" });
      expect(r).toEqual({ ok: false, error: "occurrence_already_exists", status: 409 });
      expect(rpc).not.toHaveBeenCalled();
      expect(calls.some((c) => c.op === "neq" && c.args[0] === "trigger_type" && c.args[1] === "test")).toBe(true);
    }
  );

  it("existing-occurrence probe error → 503 (fail closed), no occurrence", async () => {
    const { svc, rpc } = fakeSvc({ campaign: draft, realOccError: { message: "x" } });
    const r = await ensureDraftCampaignSendOccurrence(svc, { campaignId: "c1", adminUserId: "a1", idempotencyKey: "k" });
    expect(r).toEqual({ ok: false, error: "occurrence_lookup_failed", status: 503 });
    expect(rpc).not.toHaveBeenCalled();
  });

  it("test_only draft → 409 (test-send endpoint only), no occurrence", async () => {
    const { svc, rpc } = fakeSvc({ campaign: { ...draft, channel: "test_only" } });
    const r = await ensureDraftCampaignSendOccurrence(svc, { campaignId: "c1", adminUserId: "a1", idempotencyKey: "k" });
    expect(r).toEqual({ ok: false, error: "test_only_use_test_send_endpoint", status: 409 });
    expect(rpc).not.toHaveBeenCalled();
  });

  it("campaign lookup error → 503, no occurrence", async () => {
    const { svc, rpc } = fakeSvc({ campaignError: { message: "x" } });
    const r = await ensureDraftCampaignSendOccurrence(svc, { campaignId: "c1", adminUserId: "a1", idempotencyKey: "k" });
    expect(r).toMatchObject({ ok: false, status: 503 });
    expect(rpc).not.toHaveBeenCalled();
  });
});

describe("EVENT-02 unsent draft content refresh", () => {
  const content = {
    title: "T2", body: "B2", target_type: "all", channel: "push_only" as const,
    deeplink_url: "/events/e1", web_url: "/events/e1", push_image_url: null, in_app_image_url: null,
    target_payload: { platform_event_id: "e1" },
  };

  it("no real occurrence → updates draft row (guarded by status=draft)", async () => {
    const { svc, calls } = fakeSvc({ occSingle: null, updateResult: { data: [{ id: "c1" }], error: null } });
    expect(await updateUnsentDraftCampaignContent(svc, "c1", "a1", content)).toEqual({ updated: true });
    expect(calls.some((c) => c.op === "neq" && c.args[0] === "trigger_type" && c.args[1] === "test")).toBe(true);
    expect(calls.some((c) => c.table === "admin_notification_campaigns" && c.op === "eq" && c.args[0] === "status" && c.args[1] === "draft")).toBe(true);
  });

  it("real occurrence exists (sent/queued) → no update", async () => {
    const { svc, calls } = fakeSvc({ occSingle: { id: "o1" } });
    expect(await updateUnsentDraftCampaignContent(svc, "c1", "a1", content)).toEqual({ updated: false });
    expect(calls.some((c) => c.op === "update")).toBe(false);
  });

  it("campaign no longer draft (0 rows) → updated:false", async () => {
    const { svc } = fakeSvc({ occSingle: null, updateResult: { data: [], error: null } });
    expect(await updateUnsentDraftCampaignContent(svc, "c1", "a1", content)).toEqual({ updated: false });
  });
});

describe("wiring", () => {
  const read = (p: string) => readFileSync(join(process.cwd(), p), "utf8");
  it("send route creates a draft occurrence only when no occurrence was requested", () => {
    const src = read("app/api/admin/notification-campaigns/[campaignId]/send/route.ts");
    expect(src).toContain("if (!occurrenceId && !requestedOccurrenceId?.trim())");
    expect(src).toContain("ensureDraftCampaignSendOccurrence(svc");
  });
  it("event save reports updated only when the draft was refreshed", () => {
    const src = read("lib/platform-promotion-distribution/save-event-distribution.ts");
    expect(src.match(/action: refreshed\.updated \? "updated" : "noop"/g)?.length).toBe(2);
  });
  it("campaign detail: draft send needs preview → confirm, with one idempotency key", () => {
    const src = read("components/admin/notifications/AdminNotificationCampaignDetailPage.tsx");
    expect(src).toContain('String(camp?.status ?? "") === "draft"');
    expect(src).toContain('"Idempotency-Key": sendConfirm.idempotencyKey');
  });
  it("event panel: Push send disabled while unsaved", () => {
    const src = read("components/admin/platform-events/AdminPlatformEventDistributionPanel.tsx");
    expect(src).toContain("disabled={saving || pushHasUnsavedChanges}");
  });
});
