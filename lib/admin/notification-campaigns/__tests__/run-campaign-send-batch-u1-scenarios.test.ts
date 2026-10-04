/* U1 (EVENT-11/13/14/15, ERR-1/2, DUP-2, TIME-1, REC-1): campaign send flow scenario matrix. */
import { beforeEach, describe, expect, it, vi } from "vitest";

type Row = Record<string, unknown>;
type DB = Record<string, Row[]> & { __fail?: Record<string, number> };

const sendCampaignToUser = vi.fn();
vi.mock("@/lib/admin/notification-campaigns/campaign-send-user", () => ({
  sendCampaignToUser: (...args: unknown[]) => sendCampaignToUser(...args),
}));
vi.mock("@/lib/admin/notification-campaigns/campaign-eligibility", () => ({
  loadCampaignSettingsMaps: async () => ({}),
  evaluateCampaignUserEligibility: () => ({ eligible: true }),
}));
vi.mock("@/lib/admin/notification-campaigns/campaign-source-authority", () => ({
  evaluateOfficialCampaignSendEligibility: async () => ({ ok: true }),
}));

class Q {
  private filters: Array<(r: Row) => boolean> = [];
  private op: "select" | "update" | "upsert" | "insert" = "select";
  private patch: Row | Row[] | null = null;
  private countHead = false;
  private from_ = 0;
  private to_ = Number.MAX_SAFE_INTEGER;
  private orderKey: string | null = null;
  private single = false;
  constructor(private db: DB, private table: string) { db[table] ??= []; }
  select(_c?: string, opts?: { count?: string; head?: boolean }) { if (opts?.head) this.countHead = true; return this; }
  eq(k: string, v: unknown) { this.filters.push((r) => r[k] === v); return this; }
  neq(k: string, v: unknown) { this.filters.push((r) => r[k] != null && r[k] !== v); return this; }
  is(k: string, v: unknown) { this.filters.push((r) => (r[k] ?? null) === v); return this; }
  in(k: string, vs: unknown[]) { this.filters.push((r) => vs.includes(r[k])); return this; }
  gte() { return this; }
  order(k: string) { this.orderKey = k; return this; }
  range(a: number, b: number) { this.from_ = a; this.to_ = b; return this; }
  limit(n: number) { this.to_ = this.from_ + n - 1; return this; }
  maybeSingle() { this.single = true; return this; }
  update(p: Row) { this.op = "update"; this.patch = p; return this; }
  upsert(p: Row | Row[]) { this.op = "upsert"; this.patch = p; return this; }
  insert(p: Row) { this.op = "insert"; this.patch = p; return this; }
  then(resolve: (v: unknown) => void) {
    const f = this.db.__fail?.[`${this.table}:${this.op}`];
    if (f && f > 0) { this.db.__fail![`${this.table}:${this.op}`] = f - 1; return resolve({ data: null, count: null, error: { message: "injected" } }); }
    const match = this.db[this.table].filter((r) => this.filters.every((fn) => fn(r)));
    if (this.op === "update") { for (const r of match) Object.assign(r, this.patch); return resolve({ data: match.map((r) => ({ id: r.id })), error: null }); }
    if (this.op === "upsert") {
      for (const p of Array.isArray(this.patch) ? this.patch : [this.patch!]) {
        const ex = this.db[this.table].find((r) => r.campaign_id === p.campaign_id && r.user_id === p.user_id);
        if (ex) Object.assign(ex, p); else this.db[this.table].push({ ...p });
      }
      return resolve({ error: null });
    }
    if (this.op === "insert") { this.db[this.table].push({ ...(this.patch as Row) }); return resolve({ data: { id: "x" }, error: null }); }
    let rows = match;
    if (this.orderKey) { const k = this.orderKey; rows = [...rows].sort((a, b) => (String(a[k]) < String(b[k]) ? -1 : 1)); }
    rows = rows.slice(this.from_, this.to_ + 1);
    if (this.countHead) return resolve({ count: rows.length, error: null });
    if (this.single) return resolve({ data: rows[0] ?? null, error: null });
    return resolve({ data: rows, error: null });
  }
}
const svcOf = (db: DB) => ({ from: (t: string) => new Q(db, t) }) as never;

function makeDb(o: { users?: number; targetType?: string; sendMode?: string; trigger?: string; occStatus?: string; selected?: number }): DB {
  const tt = o.targetType ?? "all";
  const db: DB = {
    profiles: Array.from({ length: o.users ?? 0 }, (_, i) => ({ id: `u${String(i).padStart(4, "0")}` })),
    admin_notification_campaigns: [{ id: "camp-1", type: "notice", target_type: tt, title: "t", body: "b", channel: "in_app_only",
      target_payload: {}, status: o.sendMode === "recurring" ? "active" : o.sendMode === "scheduled" ? "scheduled" : "draft", send_mode: o.sendMode ?? "immediate" }],
    admin_notification_campaign_occurrences: [{ id: "occ-1", campaign_id: "camp-1", sequence_number: 1, trigger_type: o.trigger ?? "immediate",
      status: o.occStatus ?? "sending", send_claim_token: "tok-1", scheduled_for: null, send_progress_offset: 0, started_at: "2026-01-01",
      content_snapshot: { title: "t", body: "b", type: "notice", channel: "in_app_only", target_type: tt } }],
    admin_notification_campaign_targets: [],
    notification_campaign_deliveries: [],
  };
  for (let i = 0; i < (o.selected ?? 0); i++) db.admin_notification_campaign_targets.push({ campaign_id: "camp-1", occurrence_id: "occ-1", user_id: `s${i}`, status: "pending" });
  return db;
}

/** mirrors real sendCampaignToUser side effects: delivery row + target row per user */
function sendImpl(db: DB, failIf?: (u: string) => boolean) {
  return async (_s: unknown, _c: unknown, occ: string, userId: string) => {
    const fail = failIf ? failIf(String(userId)) : false;
    db.notification_campaign_deliveries.push({ occurrence_id: occ, user_id: userId, channel: "in_app", status: fail ? "failed" : "sent" });
    const t = db.admin_notification_campaign_targets.find((r) => r.user_id === userId);
    const st = { status: fail ? "failed" : "sent", occurrence_id: occ };
    if (t) Object.assign(t, st); else db.admin_notification_campaign_targets.push({ campaign_id: "camp-1", user_id: userId, ...st });
    return { ok: !fail, sent: !fail, skipped: false, failed: fail };
  };
}
const occ = (db: DB) => db.admin_notification_campaign_occurrences[0];
const camp = (db: DB) => db.admin_notification_campaigns[0];
const sentUsers = () => sendCampaignToUser.mock.calls.map((c) => c[3] as string);

async function runToCompletion(db: DB, maxRuns = 10) {
  const { runNotificationCampaignSendBatch } = await import("@/lib/admin/notification-campaigns/run-campaign-send-batch");
  let r: Awaited<ReturnType<typeof runNotificationCampaignSendBatch>> | null = null;
  for (let i = 0; i < maxRuns; i++) {
    r = await runNotificationCampaignSendBatch(svcOf(db), "occ-1");
    if (!r.ok || r.done) break;
  }
  return r!;
}

describe("U1-A+B scenario matrix (isolated)", () => {
  beforeEach(() => { sendCampaignToUser.mockReset(); vi.useRealTimers(); });

  for (const n of [1, 80, 120, 121, 250]) {
    it(`all-target ${n} users: every user exactly once, terminal sent, campaign synced`, async () => {
      const db = makeDb({ users: n });
      sendCampaignToUser.mockImplementation(sendImpl(db));
      const r = await runToCompletion(db);
      expect(r.ok).toBe(true);
      expect(r.done).toBe(true);
      expect(sentUsers().length).toBe(n);
      expect(new Set(sentUsers()).size).toBe(n);
      expect(occ(db).status).toBe("sent");
      expect(camp(db).status).toBe("sent");
    });
  }

  it("selected 250: exactly once, terminal", async () => {
    const db = makeDb({ targetType: "selected_users", selected: 250 });
    sendCampaignToUser.mockImplementation(sendImpl(db));
    const r = await runToCompletion(db);
    expect(r.done).toBe(true);
    expect(new Set(sentUsers()).size).toBe(250);
    expect(sentUsers().length).toBe(250);
    expect(occ(db).status).toBe("sent");
  });

  it("partial failure -> partially_failed; all failure -> failed", async () => {
    const a = makeDb({ users: 130 });
    sendCampaignToUser.mockImplementation(sendImpl(a, (u) => u.endsWith("7")));
    await runToCompletion(a);
    expect(occ(a).status).toBe("partially_failed");
    expect(camp(a).status).toBe("partially_failed");
    sendCampaignToUser.mockReset();
    const b = makeDb({ users: 3 });
    sendCampaignToUser.mockImplementation(sendImpl(b, () => true));
    await runToCompletion(b);
    expect(occ(b).status).toBe("failed");
  });

  it("recurring: campaign stays active; occurrence dedupe scope passed", async () => {
    const db = makeDb({ users: 5, sendMode: "recurring", trigger: "recurring" });
    sendCampaignToUser.mockImplementation(sendImpl(db));
    await runToCompletion(db);
    expect(camp(db).status).toBe("active");
    expect(sendCampaignToUser.mock.calls[0][5]).toEqual({ dedupeScope: "occurrence" });
  });

  it("scheduled: scheduled -> sent; non-recurring call shape unchanged (5 args)", async () => {
    const db = makeDb({ users: 5, sendMode: "scheduled", trigger: "scheduled" });
    sendCampaignToUser.mockImplementation(sendImpl(db));
    await runToCompletion(db);
    expect(camp(db).status).toBe("sent");
    expect(sendCampaignToUser.mock.calls[0].length).toBe(5);
  });

  it("test send: test occurrence closes, campaign untouched", async () => {
    const db = makeDb({ trigger: "test", occStatus: "queued" });
    sendCampaignToUser.mockImplementation(sendImpl(db));
    const { runNotificationCampaignTestSend } = await import("@/lib/admin/notification-campaigns/run-campaign-send-batch");
    await runNotificationCampaignTestSend(svcOf(db), "camp-1", "occ-1", ["t1"]);
    expect(occ(db).status).toBe("sent");
    expect(camp(db).status).toBe("draft");
  });

  it("killed mid-batch (offset not saved) then resumed: no user sent twice, nobody missed", async () => {
    const db = makeDb({ users: 250 });
    let calls = 0;
    const base = sendImpl(db);
    sendCampaignToUser.mockImplementation(async (...a: unknown[]) => {
      calls += 1;
      if (calls === 61) throw new Error("process killed"); // dies in the middle of batch 1
      return (base as (...x: unknown[]) => Promise<unknown>)(...a);
    });
    const { runNotificationCampaignSendBatch } = await import("@/lib/admin/notification-campaigns/run-campaign-send-batch");
    await expect(runNotificationCampaignSendBatch(svcOf(db), "occ-1")).rejects.toThrow("process killed");
    expect(occ(db).send_progress_offset).toBe(0); // offset lost, like a real kill
    const r = await runToCompletion(db);
    expect(r.done).toBe(true);
    const delivered = db.notification_campaign_deliveries.map((d) => d.user_id);
    expect(delivered.length).toBe(250);
    expect(new Set(delivered).size).toBe(250);
  });

  it("DB scan error is not treated as completion; resume finishes", async () => {
    const db = makeDb({ users: 250 });
    sendCampaignToUser.mockImplementation(sendImpl(db));
    const { runNotificationCampaignSendBatch } = await import("@/lib/admin/notification-campaigns/run-campaign-send-batch");
    await runNotificationCampaignSendBatch(svcOf(db), "occ-1"); // batch 1 ok
    db.__fail = { "profiles:select": 1 };
    const r2 = await runNotificationCampaignSendBatch(svcOf(db), "occ-1");
    expect(r2.ok).toBe(false);
    expect(r2.error).toBe("target_scan_failed");
    expect(occ(db).status).toBe("sending");
    const r3 = await runToCompletion(db);
    expect(r3.done).toBe(true);
    expect(new Set(sentUsers()).size).toBe(250);
    expect(occ(db).status).toBe("sent");
  });

  it("selected pending-count error is not completion", async () => {
    const db = makeDb({ targetType: "selected_users", selected: 5 });
    sendCampaignToUser.mockImplementation(sendImpl(db));
    db.__fail = { "admin_notification_campaign_targets:select": 2 }; // pending read ok? first select = pending list
    const { runNotificationCampaignSendBatch } = await import("@/lib/admin/notification-campaigns/run-campaign-send-batch");
    const r = await runNotificationCampaignSendBatch(svcOf(db), "occ-1");
    expect(r.ok).toBe(false);
    expect(occ(db).status).toBe("sending");
  });

  it("delivery-metrics read error leaves occurrence non-terminal (no false sent); next run closes", async () => {
    const db = makeDb({ users: 10 });
    sendCampaignToUser.mockImplementation(sendImpl(db));
    db.__fail = { "notification_campaign_deliveries:select": 1 };
    const { runNotificationCampaignSendBatch } = await import("@/lib/admin/notification-campaigns/run-campaign-send-batch");
    const r1 = await runNotificationCampaignSendBatch(svcOf(db), "occ-1");
    expect(r1.done).toBe(true);
    expect(occ(db).status).toBe("sending");
    const r2 = await runNotificationCampaignSendBatch(svcOf(db), "occ-1");
    expect(r2.done).toBe(true);
    expect(occ(db).status).toBe("sent");
    expect(sentUsers().length).toBe(10);
  });

  it("provider failure is recorded as failure, not sent", async () => {
    const db = makeDb({ users: 4 });
    sendCampaignToUser.mockImplementation(sendImpl(db, (u) => u === "u0002"));
    await runToCompletion(db);
    expect(occ(db).status).toBe("partially_failed");
  });

  it("continuation release: only the claim holder releases; due time set; status queued", async () => {
    const db = makeDb({ users: 1 });
    const { releaseOccurrenceForContinuation } = await import("@/lib/admin/notification-campaigns/claim-scheduled-campaign");
    expect(await releaseOccurrenceForContinuation(svcOf(db), "occ-1", "other-token")).toBe(false);
    expect(occ(db).status).toBe("sending");
    expect(await releaseOccurrenceForContinuation(svcOf(db), "occ-1", "tok-1")).toBe(true);
    expect(occ(db).status).toBe("queued");
    expect(occ(db).scheduled_for).toBeTruthy();
    expect(occ(db).send_claim_token).toBeNull();
  });

  it("drain stops before a batch that would not fit the wall budget", async () => {
    const db = makeDb({ users: 500 });
    const base = sendImpl(db);
    let t = 0;
    const nowSpy = vi.spyOn(Date, "now").mockImplementation(() => t);
    sendCampaignToUser.mockImplementation(async (...a: unknown[]) => { t += 100; return (base as (...x: unknown[]) => Promise<unknown>)(...a); }); // 120 users = 12s
    const { drainNotificationCampaignSendBatches } = await import("@/lib/admin/notification-campaigns/claim-scheduled-campaign");
    const d = await drainNotificationCampaignSendBatches(svcOf(db), "occ-1", { maxBatches: 10, maxWallMs: 20_000 });
    nowSpy.mockRestore();
    expect(d.ok).toBe(true);
    expect(d.batches).toBe(1); // 12s used; next 12s batch would exceed 20s
    expect(d.done).toBe(false);
  });

  function recurringSelectedDb() {
    const db = makeDb({ targetType: "selected_users", selected: 3, sendMode: "recurring", trigger: "recurring" });
    Object.assign(camp(db), { recurrence_kind: "daily", recurrence_time: "09:00", recurrence_timezone: "Asia/Seoul",
      recurrence_start_at: "2026-01-01T00:00:00Z", recurrence_end_at: null, recurrence_max_count: null, recurrence_weekday: null, status: "active" });
    for (const t of db.admin_notification_campaign_targets) t.status = "sent";
    Object.assign(occ(db), { status: "sent", scheduled_for: "2026-01-02T00:00:00Z", completed_at: "2026-01-02T00:05:00Z" });
    return db;
  }

  it("recurring selected_users: NEW (queued) next occurrence re-arms existing targets as pending", async () => {
    const db = recurringSelectedDb();
    const rpc = vi.fn(async () => ({ data: { id: "occ-2", campaign_id: "camp-1", sequence_number: 2, status: "queued" }, error: null }));
    const { scheduleNextRecurringOccurrence } = await import("@/lib/admin/notification-campaigns/claim-scheduled-campaign");
    const next = await scheduleNextRecurringOccurrence({ from: (t: string) => new Q(db, t), rpc } as never, "camp-1");
    expect(next?.id).toBe("occ-2");
    expect(db.admin_notification_campaign_targets.every((t) => t.status === "pending" && t.occurrence_id === "occ-2")).toBe(true);
  });

  it("recurring: idempotent RPC returning an EXISTING sent occurrence (stalled QA case) changes nothing", async () => {
    const db = recurringSelectedDb();
    const rpc = vi.fn(async () => ({ data: { id: "occ-1", campaign_id: "camp-1", sequence_number: 1, status: "sent" }, error: null }));
    const { scheduleNextRecurringOccurrence } = await import("@/lib/admin/notification-campaigns/claim-scheduled-campaign");
    await scheduleNextRecurringOccurrence({ from: (t: string) => new Q(db, t), rpc } as never, "camp-1");
    expect(db.admin_notification_campaign_targets.every((t) => t.status === "sent" && t.occurrence_id === "occ-1")).toBe(true);
    expect(camp(db).status).toBe("active");
  });
});
