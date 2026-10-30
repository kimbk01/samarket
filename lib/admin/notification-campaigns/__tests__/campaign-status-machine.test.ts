import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import {
  CAMPAIGN_CLAIM_BLOCKED_STATUSES,
  CAMPAIGN_LIST_DEFAULT_PAGE_SIZE,
  CAMPAIGN_LIST_MAX_PAGE_SIZE,
  CAMPAIGN_STATUSES,
  CAMPAIGN_STATUS_TRANSITIONS,
  CAMPAIGN_TAB_STATUSES,
  allowedCampaignActions,
  campaignListQueryToSearchParams,
  campaignListRange,
  campaignStatusLabel,
  campaignTabForStatus,
  campaignTitleSearchPattern,
  canTransitionCampaignStatus,
  evaluateCampaignAction,
  parseCampaignListQuery,
  resolveEffectiveCampaignStatus,
} from "@/lib/admin/notification-campaigns/campaign-status-machine";
import { CAMPAIGN_STATUSES as LEGACY_EXPORT } from "@/lib/admin/notification-campaigns/campaign-types";
import { CAMPAIGN_LIFECYCLE_STATUSES } from "@/lib/admin/notification-campaigns/campaign-occurrence-types";
import { campaignActionForStatusChange } from "@/lib/admin/notification-campaigns/campaign-lifecycle-service";

const read = (p: string) => readFileSync(join(process.cwd(), p), "utf8");

describe("ADM-09 status list = DB CHECK", () => {
  it("matches admin_notification_campaigns_status_check (migration 20261029120000)", () => {
    const sql = read("supabase/migrations/20261029120000_admin_notification_campaign_occurrences.sql");
    const block = sql.slice(sql.indexOf("ADD CONSTRAINT admin_notification_campaigns_status_check"));
    const inner = block.slice(block.indexOf("status IN ("), block.indexOf(")", block.indexOf("status IN (")));
    const dbStatuses = [...inner.matchAll(/'([a-z_]+)'/g)].map((m) => m[1]);
    expect([...dbStatuses].sort()).toEqual([...CAMPAIGN_STATUSES].sort());
  });

  it("legacy exports point at the same SSOT list", () => {
    expect(LEGACY_EXPORT).toBe(CAMPAIGN_STATUSES);
    expect(CAMPAIGN_LIFECYCLE_STATUSES).toBe(CAMPAIGN_STATUSES);
  });

  it("claim-blocked statuses mirror the claim RPC filter", () => {
    const sql = read("supabase/migrations/20261029120000_admin_notification_campaign_occurrences.sql");
    const m = sql.match(/c\.status NOT IN \(([^)]+)\)/);
    expect(m).not.toBeNull();
    const rpc = [...(m?.[1] ?? "").matchAll(/'([a-z_]+)'/g)].map((x) => x[1]).sort();
    expect(rpc).toEqual([...CAMPAIGN_CLAIM_BLOCKED_STATUSES].sort());
  });
});

describe("ADM-09 transition table mirrored in SQL", () => {
  it("SQL VALUES pairs == TS table", () => {
    const sql = read("supabase/migrations/20270516120000_admin_notification_campaign_cms.sql");
    const fn = sql.slice(sql.indexOf("admin_notification_campaign_status_transition_allowed("));
    const values = fn.slice(fn.indexOf("VALUES"), fn.indexOf(") AS t"));
    const sqlPairs = [...values.matchAll(/\('([a-z_]+)', '([a-z_]+)'\)/g)].map((m) => `${m[1]}>${m[2]}`).sort();
    const tsPairs = Object.entries(CAMPAIGN_STATUS_TRANSITIONS)
      .flatMap(([from, tos]) => tos.map((to) => `${from}>${to}`))
      .sort();
    expect(sqlPairs.length).toBeGreaterThan(0);
    expect(sqlPairs).toEqual(tsPairs);
  });

  it("every status has a row and targets are valid statuses", () => {
    for (const s of CAMPAIGN_STATUSES) {
      expect(CAMPAIGN_STATUS_TRANSITIONS[s]).toBeDefined();
      for (const to of CAMPAIGN_STATUS_TRANSITIONS[s]) expect(CAMPAIGN_STATUSES).toContain(to);
    }
  });
});

describe("transition rules", () => {
  it("ADM-03: scheduled cancel → cancelled, never back to draft", () => {
    expect(canTransitionCampaignStatus("scheduled", "cancelled")).toBe(true);
    expect(canTransitionCampaignStatus("scheduled", "draft")).toBe(false);
  });
  it("sending can be stopped; terminal statuses are final", () => {
    expect(canTransitionCampaignStatus("sending", "cancelled")).toBe(true);
    for (const s of ["sent", "partially_failed", "cancelled", "ended"]) {
      for (const to of CAMPAIGN_STATUSES) expect(canTransitionCampaignStatus(s, to)).toBe(false);
    }
  });
  it("recurring lifecycle: active ↔ paused, both → ended; never `sending` on the campaign row", () => {
    expect(canTransitionCampaignStatus("active", "paused")).toBe(true);
    expect(canTransitionCampaignStatus("paused", "active")).toBe(true);
    expect(canTransitionCampaignStatus("active", "ended")).toBe(true);
    expect(canTransitionCampaignStatus("paused", "ended")).toBe(true);
    expect(canTransitionCampaignStatus("active", "sending")).toBe(false);
  });
  it("unknown statuses are rejected", () => {
    expect(canTransitionCampaignStatus("draft", "bogus")).toBe(false);
    expect(canTransitionCampaignStatus("bogus", "draft")).toBe(false);
  });
});

describe("evaluateCampaignAction (cancel / stop / edit rules)", () => {
  it("edit only in draft · scheduled · paused", () => {
    expect(evaluateCampaignAction("edit", { status: "draft" }).ok).toBe(true);
    expect(evaluateCampaignAction("edit", { status: "scheduled" }).ok).toBe(true);
    expect(evaluateCampaignAction("edit", { status: "paused", sendMode: "recurring" }).ok).toBe(true);
    for (const s of ["sending", "sent", "partially_failed", "failed", "cancelled", "ended", "active"]) {
      expect(evaluateCampaignAction("edit", { status: s })).toEqual({ ok: false, error: "campaign_not_editable" });
    }
  });
  it("legacy draft that already dispatched is not editable (duplicate only)", () => {
    const ctx = { status: "draft", hasDispatchedOccurrence: true };
    expect(evaluateCampaignAction("edit", ctx).ok).toBe(false);
    expect(evaluateCampaignAction("send", ctx).ok).toBe(false);
    expect(evaluateCampaignAction("duplicate", ctx).ok).toBe(true);
  });
  it("after sending only duplicate (and archive) remain", () => {
    expect(allowedCampaignActions({ status: "sent" }).sort()).toEqual(["archive", "duplicate"]);
  });
  it("cancel: one-shot scheduled ok; recurring must use stop_recurring; sending must use stop_sending", () => {
    expect(evaluateCampaignAction("cancel", { status: "scheduled", sendMode: "scheduled" }).ok).toBe(true);
    expect(evaluateCampaignAction("cancel", { status: "active", sendMode: "recurring" })).toEqual({
      ok: false,
      error: "use_stop_recurring",
    });
    expect(evaluateCampaignAction("cancel", { status: "sending" }).ok).toBe(false);
  });
  it("stop_sending only while sending", () => {
    expect(evaluateCampaignAction("stop_sending", { status: "sending" }).ok).toBe(true);
    expect(evaluateCampaignAction("stop_sending", { status: "scheduled" }).ok).toBe(false);
  });
  it("pause / resume / stop_recurring only for recurring", () => {
    expect(evaluateCampaignAction("pause", { status: "active", sendMode: "recurring" }).ok).toBe(true);
    expect(evaluateCampaignAction("pause", { status: "active", sendMode: "scheduled" })).toEqual({
      ok: false,
      error: "not_recurring",
    });
    expect(evaluateCampaignAction("resume", { status: "paused", sendMode: "recurring" }).ok).toBe(true);
    expect(evaluateCampaignAction("resume", { status: "active", sendMode: "recurring" }).ok).toBe(false);
    expect(evaluateCampaignAction("stop_recurring", { status: "paused", sendMode: "recurring" }).ok).toBe(true);
    expect(evaluateCampaignAction("stop_recurring", { status: "ended", sendMode: "recurring" }).ok).toBe(false);
  });
  it("resend needs a failed occurrence", () => {
    expect(evaluateCampaignAction("resend", { status: "failed", hasFailedOccurrence: true }).ok).toBe(true);
    expect(evaluateCampaignAction("resend", { status: "failed" }).ok).toBe(false);
    expect(evaluateCampaignAction("resend", { status: "sent", hasFailedOccurrence: true }).ok).toBe(false);
  });
  it("archive: nothing in flight; archived blocks all but unarchive/duplicate", () => {
    expect(evaluateCampaignAction("archive", { status: "sent" }).ok).toBe(true);
    expect(evaluateCampaignAction("archive", { status: "scheduled" }).ok).toBe(false);
    expect(evaluateCampaignAction("archive", { status: "sending" }).ok).toBe(false);
    const archived = { status: "draft", archived: true };
    expect(allowedCampaignActions(archived).sort()).toEqual(["duplicate", "unarchive"]);
  });
  it("schedule: draft only (scheduled reschedules via edit), never test_only", () => {
    expect(evaluateCampaignAction("schedule", { status: "draft" }).ok).toBe(true);
    expect(evaluateCampaignAction("schedule", { status: "draft", channel: "test_only" }).ok).toBe(false);
    expect(evaluateCampaignAction("schedule", { status: "sent" }).ok).toBe(false);
  });
});

describe("PATCH status → action mapping (transition-table gated)", () => {
  it("maps legal changes", () => {
    expect(campaignActionForStatusChange("active", "paused")).toBe("pause");
    expect(campaignActionForStatusChange("paused", "active")).toBe("resume");
    expect(campaignActionForStatusChange("draft", "scheduled")).toBe("schedule");
    expect(campaignActionForStatusChange("draft", "active")).toBe("schedule");
    expect(campaignActionForStatusChange("paused", "ended")).toBe("stop_recurring");
    expect(campaignActionForStatusChange("scheduled", "cancelled")).toBe("cancel");
    expect(campaignActionForStatusChange("sending", "cancelled")).toBe("stop_sending");
  });
  it("rejects illegal changes", () => {
    expect(campaignActionForStatusChange("scheduled", "draft")).toBeNull();
    expect(campaignActionForStatusChange("sent", "draft")).toBeNull();
    expect(campaignActionForStatusChange("draft", "sent")).toBeNull();
    // execution statuses are owned by the batch runner, not PATCH
    expect(campaignActionForStatusChange("draft", "sending")).toBeNull();
  });
});

describe("ADM-05 list query parsing", () => {
  const parse = (q: string) => parseCampaignListQuery(new URLSearchParams(q));

  it("defaults", () => {
    expect(parse("")).toEqual({
      tab: "completed",
      page: 1,
      pageSize: CAMPAIGN_LIST_DEFAULT_PAGE_SIZE,
      status: null,
      type: null,
      q: null,
    });
  });
  it("clamps page/page_size and ignores garbage", () => {
    expect(parse("page=0&page_size=9999").page).toBe(1);
    expect(parse("page=0&page_size=9999").pageSize).toBe(CAMPAIGN_LIST_MAX_PAGE_SIZE);
    expect(parse("page=abc&page_size=-3")).toMatchObject({ page: 1, pageSize: CAMPAIGN_LIST_DEFAULT_PAGE_SIZE });
    expect(parse("page=3.7").page).toBe(3);
  });
  it("unknown tab → 보낸 알림(completed, v3 기본); legacy audience=qa → qa tab", () => {
    expect(parse("tab=nope").tab).toBe("completed");
    expect(parse("audience=qa").tab).toBe("qa");
    expect(parse("tab=completed&audience=qa").tab).toBe("completed");
  });
  it("status filter must belong to the tab", () => {
    expect(parse("tab=in_progress&status=paused").status).toBe("paused");
    expect(parse("tab=in_progress&status=sent").status).toBeNull();
    expect(parse("tab=completed&status=ended").status).toBe("ended");
    expect(parse("tab=archived&status=sent").status).toBe("sent");
  });
  it("type / q", () => {
    expect(parse("type=marketing&q=%20hello%20").type).toBe("marketing");
    expect(parse("type=marketing&q=%20hello%20").q).toBe("hello");
    expect(parse("type=evil").type).toBeNull();
    expect(parse(`q=${"x".repeat(200)}`).q?.length).toBe(80);
  });
  it("round-trips through URL params (defaults omitted)", () => {
    const q = parse("tab=drafting&page=4&page_size=50&type=notice&q=sale");
    const sp = campaignListQueryToSearchParams(q);
    expect(parseCampaignListQuery(sp)).toEqual(q);
    expect(campaignListQueryToSearchParams(parse("")).toString()).toBe("");
  });
  it("range for page", () => {
    expect(campaignListRange({ page: 1, pageSize: 20 })).toEqual({ from: 0, to: 19 });
    expect(campaignListRange({ page: 3, pageSize: 20 })).toEqual({ from: 40, to: 59 });
  });
  it("title search escapes LIKE wildcards", () => {
    expect(campaignTitleSearchPattern("50%_off\\")).toBe("%50\\%\\_off\\\\%");
  });
});

describe("tabs & labels", () => {
  it("tab statuses partition every status", () => {
    const all = [
      ...CAMPAIGN_TAB_STATUSES.drafting,
      ...CAMPAIGN_TAB_STATUSES.in_progress,
      ...CAMPAIGN_TAB_STATUSES.completed,
    ].sort();
    expect(all).toEqual([...CAMPAIGN_STATUSES].sort());
    expect(campaignTabForStatus("paused")).toBe("in_progress");
    expect(campaignTabForStatus("ended")).toBe("completed");
  });
  it("Korean labels", () => {
    expect(campaignStatusLabel("cancelled")).toBe("취소됨");
    expect(campaignStatusLabel("active")).toBe("반복 활성");
    expect(campaignStatusLabel("partially_failed")).toBe("부분 실패");
  });
  it("legacy draft with a finished occurrence displays the outcome", () => {
    expect(resolveEffectiveCampaignStatus("draft", "sent")).toBe("sent");
    expect(resolveEffectiveCampaignStatus("draft", "queued")).toBe("draft");
    expect(resolveEffectiveCampaignStatus("scheduled", "sent")).toBe("scheduled");
  });
});
