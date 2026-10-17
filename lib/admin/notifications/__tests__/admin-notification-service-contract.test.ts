import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it, vi } from "vitest";
import {
  authorityAllows,
  countUnreadAdminNotifications,
  createAdminNotification,
  listAdminNotifications,
  loadAdminNotificationDeliveryHealth,
  runAdminNotificationDeliveryWorker,
  markAdminNotificationsRead,
  type AdminRecipientAuthority,
} from "@/lib/admin/notifications/admin-notification-service";
import { releaseSupportAssignmentsOnRevoke } from "@/lib/admin/admin-membership";

const read = (rel: string) => readFileSync(join(process.cwd(), rel), "utf8");

type Row = Record<string, unknown>;

/**
 * In-memory PostgREST fake (subset): select/eq/is/in/not/gte/lt/order/limit, upsert with
 * onConflict + ignoreDuplicates, update, insert. Enough to exercise the service end to end.
 */
function memoryDb(seed: Record<string, Row[]> = {}, opts: { failInsertInto?: Set<string> } = {}) {
  const tables: Record<string, Row[]> = Object.fromEntries(
    Object.entries(seed).map(([k, v]) => [k, v.map((r) => ({ ...r }))])
  );
  let seq = 0;
  const sb = {
    tables,
    from(table: string) {
      tables[table] ??= [];
      const preds: ((r: Row) => boolean)[] = [];
      let mode: "select" | "update" | "upsert" | "insert" = "select";
      let patch: Row = {};
      let upsertRows: Row[] = [];
      let conflictCols: string[] = [];
      let limitN = Infinity;
      let order: { col: string; asc: boolean } | null = null;
      const b: Record<string, unknown> = {
        select: () => b,
        eq: (c: string, v: unknown) => (preds.push((r) => r[c] === v), b),
        is: (c: string, v: unknown) => (preds.push((r) => (r[c] ?? null) === v), b),
        in: (c: string, v: unknown[]) => (preds.push((r) => v.includes(r[c])), b),
        not: (c: string, op: string, v: string) => {
          const vals = v.replace(/[()]/g, "").split(",");
          preds.push((r) => !vals.includes(String(r[c])));
          return b;
        },
        gte: (c: string, v: string) => (preds.push((r) => String(r[c]) >= v), b),
        lt: (c: string, v: string) => (preds.push((r) => String(r[c]) < v), b),
        order: (col: string, o: { ascending: boolean }) => ((order = { col, asc: o.ascending }), b),
        limit: (n: number) => ((limitN = n), b),
        maybeSingle: () =>
          Promise.resolve({ data: tables[table].find((r) => preds.every((p) => p(r))) ?? null, error: null }),
        update: (p: Row) => ((mode = "update"), (patch = p), b),
        insert: (rows: Row | Row[]) => ((mode = "insert"), (upsertRows = Array.isArray(rows) ? rows : [rows]), b),
        upsert: (rows: Row[], o: { onConflict: string }) => (
          (mode = "upsert"), (upsertRows = rows), (conflictCols = o.onConflict.split(",")), b
        ),
        then: (resolve: (r: unknown) => unknown) => {
          const t = tables[table];
          if (mode === "upsert" || mode === "insert") {
            if (opts.failInsertInto?.has(table)) {
              return resolve({ data: null, error: { message: "canceling statement due to statement timeout" } });
            }
            const inserted: Row[] = [];
            for (const r of upsertRows) {
              const dup =
                mode === "upsert" && t.some((x) => conflictCols.every((c) => x[c] === r[c]));
              if (dup) continue;
              const row = { id: `id-${++seq}`, created_at: new Date(Date.now() + seq).toISOString(), read_at: null, archived_at: null, ...r };
              t.push(row);
              inserted.push(row);
            }
            return resolve({ data: inserted, error: null });
          }
          const matched = t.filter((r) => preds.every((p) => p(r)));
          if (mode === "update") {
            for (const r of matched) Object.assign(r, patch);
            return resolve({ data: matched.map((r) => ({ ...r })), error: null });
          }
          const out = [...matched];
          if (order) {
            const { col, asc } = order;
            out.sort((a, z) => (String(a[col]) < String(z[col]) ? (asc ? -1 : 1) : asc ? 1 : -1));
          }
          return resolve({ data: out.slice(0, limitN === Infinity ? undefined : limitN), error: null });
        },
      };
      return b;
    },
    /** SQL-equivalent fakes of the 20270509 delivery RPCs (claim = token CAS, dead after max). */
    rpc(fn: string, args: Record<string, unknown> = {}) {
      const outbox = (tables.admin_notification_outbox ??= []);
      const pushes = (tables.admin_notification_push_deliveries ??= []);
      const ok = (data: unknown) => Promise.resolve({ data, error: null });
      switch (fn) {
        case "admin_notification_outbox_enqueue": {
          if (outbox.some((o) => o.source_key === args.p_source_key)) return ok(false);
          outbox.push({
            id: `ob-${++seq}`, source_key: args.p_source_key, kind: args.p_kind,
            payload: JSON.parse(JSON.stringify(args.p_payload)), status: "pending",
            attempts: args.p_error ? 1 : 0, max_attempts: 8, last_error: args.p_error ?? null,
          });
          return ok(true);
        }
        case "admin_notification_replay_support_replies":
          return ok(0);
        case "admin_notification_outbox_claim": {
          const due = outbox.filter((o) => o.status === "pending");
          for (const o of due) Object.assign(o, { status: "processing", claim_token: `ct-${++seq}`, attempts: Number(o.attempts) + 1 });
          return ok(due.map((o) => ({ ...o })));
        }
        case "admin_notification_outbox_finish": {
          const o = outbox.find((x) => x.id === args.p_id && x.claim_token === args.p_claim_token && x.status === "processing");
          if (!o) return ok("stale_claim");
          o.claim_token = null;
          if (args.p_ok) return (o.status = "delivered"), (o.last_error = null), ok("delivered");
          o.last_error = args.p_error;
          if (Number(o.attempts) >= Number(o.max_attempts)) return (o.status = "dead"), ok("dead");
          return (o.status = "pending"), ok("retry");
        }
        case "admin_notification_push_claim": {
          for (const d of pushes) if (d.status === "sending" && d.stale === true) Object.assign(d, { status: "unknown_outcome", claim_token: null });
          const due = pushes.filter((d) => d.status === "pending" || d.status === "retry");
          for (const d of due) Object.assign(d, { status: "sending", claim_token: `pt-${++seq}`, attempts: Number(d.attempts ?? 0) + 1 });
          return ok(due.map((d) => ({ ...d })));
        }
        case "admin_notification_push_finish": {
          const d = pushes.find((x) => x.notification_id === args.p_notification_id && x.claim_token === args.p_claim_token && x.status === "sending");
          if (!d) return ok("stale_claim");
          const r = String(args.p_result);
          const max = Number(d.max_attempts ?? 5);
          const status =
            r === "sent" || r.startsWith("skipped_") ? r : r === "retryable" && Number(d.attempts) < max ? "retry" : "dead";
          Object.assign(d, { status, claim_token: null, last_error: status === "sent" ? null : args.p_error });
          const n = (tables.admin_notifications ?? []).find((x) => x.id === args.p_notification_id);
          if (n) n.push_status = status === "retry" ? "none" : status === "dead" ? "failed" : status;
          return ok(status);
        }
        case "admin_notification_delivery_health":
          return ok({
            outbox_dead: outbox.filter((o) => o.status === "dead").length,
            outbox_pending: outbox.filter((o) => o.status === "pending" || o.status === "processing").length,
            push_dead: pushes.filter((d) => d.status === "dead").length,
            push_unknown: pushes.filter((d) => d.status === "unknown_outcome").length,
          });
        default:
          return Promise.resolve({ data: null, error: { message: `unknown rpc ${fn}` } });
      }
    },
  };
  return sb;
}

const SUPER: AdminRecipientAuthority = { active: true, isSuperAdmin: true, permissions: [] };
const OPERATOR: AdminRecipientAuthority = { active: true, isSuperAdmin: false, permissions: ["users"] };
const REVOKED: AdminRecipientAuthority = { active: false };

describe("R13 admin notification service", () => {
  it("delivers to the assigned admin once; the same event never double-sends", async () => {
    const sb = memoryDb();
    const sendPush = vi.fn(async () => "sent" as const);
    const deps = { resolveAuthority: async () => SUPER, sendPush };
    const input = {
      recipientAdminIds: ["admin-a"],
      kind: "support_customer_replied",
      title: "문의 S-1",
      body: "hello",
      workRef: { table: "support_cases", id: "case-1" },
      dedupeKey: "support_customer_replied:msg-1",
      push: true,
    };
    const first = await createAdminNotification(sb as never, input, deps);
    const retry = await createAdminNotification(sb as never, input, deps);
    expect(first).toMatchObject({ ok: true, created: 1, pushed: 1 });
    expect(retry).toMatchObject({ ok: true, created: 0, pushed: 0 });
    expect(sb.tables.admin_notifications).toHaveLength(1);
    expect(sendPush).toHaveBeenCalledTimes(1);
  });

  it("revoked recipient: no row, no push", async () => {
    const sb = memoryDb();
    const sendPush = vi.fn(async () => "sent" as const);
    const r = await createAdminNotification(
      sb as never,
      { recipientAdminIds: ["gone"], kind: "support_customer_replied", title: "x", dedupeKey: "k", push: true },
      { resolveAuthority: async () => REVOKED, sendPush }
    );
    expect(r).toMatchObject({ ok: true, created: 0, skippedRecipients: 1 });
    expect(sendPush).not.toHaveBeenCalled();
  });

  it("authority revoked between create and push → push skipped (re-verified at send time)", async () => {
    const sb = memoryDb();
    const sendPush = vi.fn(async () => "sent" as const);
    let calls = 0;
    const resolveAuthority = async () => (++calls === 1 ? SUPER : REVOKED);
    const r = await createAdminNotification(
      sb as never,
      { recipientAdminIds: ["admin-a"], kind: "support_customer_replied", title: "x", dedupeKey: "k2", push: true },
      { resolveAuthority, sendPush }
    );
    expect(r).toMatchObject({ ok: true, created: 1, pushed: 0 });
    expect(sendPush).not.toHaveBeenCalled();
    expect(sb.tables.admin_notifications[0]?.push_status).toBe("skipped_revoked");
  });

  it("permission broadcast fans out one row per eligible admin (no duplicates, no missing)", async () => {
    const sb = memoryDb({
      admin_memberships: [
        { user_id: "super", status: "active" },
        { user_id: "fin", status: "active" },
        { user_id: "ops", status: "active" },
        { user_id: "old", status: "revoked" },
      ],
    });
    const authorities: Record<string, AdminRecipientAuthority> = {
      super: SUPER,
      fin: { active: true, isSuperAdmin: false, permissions: ["business"] },
      ops: OPERATOR,
    };
    const deps = { resolveAuthority: async (_: unknown, uid: string) => authorities[uid] ?? REVOKED };
    const input = {
      broadcastPermission: "business" as const,
      kind: "settlement_held",
      title: "정산 보류",
      dedupeKey: "settlement_held:s1",
    };
    const a = await createAdminNotification(sb as never, input, deps);
    const b = await createAdminNotification(sb as never, input, deps);
    expect(a).toMatchObject({ ok: true, created: 2, skippedRecipients: 1 });
    expect(b).toMatchObject({ ok: true, created: 0 });
    const recipients = sb.tables.admin_notifications.map((r) => r.recipient_admin_id).sort();
    expect(recipients).toEqual(["fin", "super"]);
  });

  it("read/list are recipient-scoped and re-check the required permission", async () => {
    const sb = memoryDb({
      admin_notifications: [
        { id: "n1", recipient_admin_id: "a", required_permission: null, kind: "k", severity: "info", title: "t1", dedupe_key: "1", created_at: new Date().toISOString(), read_at: null, archived_at: null },
        { id: "n2", recipient_admin_id: "a", required_permission: "business", kind: "k", severity: "info", title: "t2", dedupe_key: "2", created_at: new Date().toISOString(), read_at: null, archived_at: null },
        { id: "n3", recipient_admin_id: "b", required_permission: null, kind: "k", severity: "info", title: "t3", dedupe_key: "3", created_at: new Date().toISOString(), read_at: null, archived_at: null },
        { id: "n4", recipient_admin_id: "a", required_permission: null, kind: "k", severity: "info", title: "old", dedupe_key: "4", created_at: "2020-01-01T00:00:00.000Z", read_at: null, archived_at: null },
      ],
    });
    const list = await listAdminNotifications(sb as never, { adminUserId: "a", authority: OPERATOR });
    expect(list.ok && list.items.map((i) => i.id)).toEqual(["n1"]);
    expect(list.ok && list.unread).toBe(1);
    const asSuper = await countUnreadAdminNotifications(sb as never, { adminUserId: "a", authority: SUPER });
    expect(asSuper).toEqual({ ok: true, unread: 2 }); // n4 is past the 90-day retention
    const revoked = await listAdminNotifications(sb as never, { adminUserId: "a", authority: REVOKED });
    expect(revoked.ok).toBe(false);

    const marked = await markAdminNotificationsRead(sb as never, { adminUserId: "a", all: true });
    expect(marked.ok).toBe(true);
    // b's row is never touched by a's mark-all
    expect(sb.tables.admin_notifications.find((r) => r.id === "n3")?.read_at).toBeNull();
  });

  it("authorityAllows mirrors requireAdminPermission (super sees all, revoked sees nothing)", () => {
    expect(authorityAllows(SUPER, "business")).toBe(true);
    expect(authorityAllows(OPERATOR, "business")).toBe(false);
    expect(authorityAllows(OPERATOR, null)).toBe(true);
    expect(authorityAllows(REVOKED, null)).toBe(false);
  });

  it("revoke releases open support assignments with an audit event; closed cases untouched", async () => {
    const sb = memoryDb({
      support_cases: [
        { id: "c1", assigned_admin_id: "a", status: "OPEN" },
        { id: "c2", assigned_admin_id: "a", status: "WAITING_ADMIN" },
        { id: "c3", assigned_admin_id: "a", status: "RESOLVED" },
        { id: "c4", assigned_admin_id: "b", status: "OPEN" },
      ],
    });
    const r = await releaseSupportAssignmentsOnRevoke(sb as never, { userId: "a", revokedBy: "super" });
    expect(r.released).toBe(2);
    const byId = Object.fromEntries(sb.tables.support_cases.map((c) => [c.id, c.assigned_admin_id]));
    expect(byId).toEqual({ c1: null, c2: null, c3: "a", c4: "b" });
    expect(sb.tables.support_case_events.map((e) => e.case_id).sort()).toEqual(["c1", "c2"]);
  });
});

describe("R13 store / RLS / separation contracts", () => {
  it("migration: per-recipient unique dedupe, recipient+active-admin RLS, no client write policy", () => {
    const mig = read("supabase/migrations/20270508120000_admin_notifications_inbox.sql");
    expect(mig).toContain("unique (recipient_admin_id, dedupe_key)");
    expect(mig).toContain("recipient_admin_id = auth.uid()");
    expect(mig).toContain("internal.is_platform_admin(auth.uid())");
    expect(mig).not.toMatch(/create policy[^;]*for (insert|update|delete)/i);
    expect(mig).toContain("admin_notifications_archive_expired");
    expect(mig).not.toMatch(/delete from public\.admin_notifications/i);
    expect(mig).not.toMatch(/^\s*drop\s/im); // re-run safe without destructive DDL
  });

  it("support_customer_replied uses the admin store, never the member pipeline", () => {
    const svc = read("lib/support/support-case-service.ts");
    expect(svc).toMatch(/createAdminNotification\(sb, \{\s*recipientAdminIds: \[assignee\],\s*kind: "support_customer_replied"/);
    expect(svc).not.toMatch(/notifySupportEvent\(sb, \{[^}]*type: "support_customer_replied"/);
    expect(svc).toContain('"assignee_not_active_admin"');
    // self-heal when the assignee lost authority and the revoke-time release did not happen
    expect(svc).toMatch(/notified\.skippedRecipients > 0[\s\S]{0,400}assigned_admin_id: null[\s\S]{0,200}\.eq\("assigned_admin_id", assignee\)/);
  });

  it("Bell (Action Queue) and inbox (notifications) never read each other's source", () => {
    const bell = read("components/admin/order-notifications/AdminNotificationBell.tsx");
    const inbox = read("components/admin/inbox/AdminInboxLink.tsx");
    expect(bell).not.toContain("/api/admin/inbox");
    expect(inbox).not.toContain("/api/admin/admin-bell");
    expect(inbox).toContain("/api/admin/inbox?summary=1");
    const queue = read("lib/admin/admin-action-queue.ts");
    expect(queue).not.toContain("admin_notifications");
  });
});

describe("R13-D reliable delivery (outbox · replay · at-most-once push)", () => {
  const input = {
    recipientAdminIds: ["admin-a"],
    kind: "support_customer_replied",
    title: "문의 S-9",
    workRef: { table: "support_cases", id: "case-9" },
    dedupeKey: "support_customer_replied:msg-9",
    push: true,
  };

  it("transient inbox write failure → event queued durably → worker re-creates it exactly once", async () => {
    const sb = memoryDb({}, { failInsertInto: new Set(["admin_notifications"]) });
    const sendPush = vi.fn(async () => "sent" as const);
    const deps = { resolveAuthority: async () => SUPER, sendPush };
    const r = await createAdminNotification(sb as never, input, deps);
    expect(r).toMatchObject({ ok: false, queued: true });
    // a second failing attempt for the same event never adds a second outbox row
    await createAdminNotification(sb as never, input, deps);
    expect(sb.tables.admin_notification_outbox).toHaveLength(1);
    expect(sb.tables.admin_notification_outbox[0]).toMatchObject({ status: "pending", attempts: 1 });
    expect(sb.tables.admin_notification_outbox[0]?.last_error).toMatch(/timeout/);

    // DB recovers
    const healed = memoryDb({ admin_notification_outbox: sb.tables.admin_notification_outbox });
    const run = await runAdminNotificationDeliveryWorker(healed as never, deps);
    expect(run).toMatchObject({ outboxClaimed: 1, outboxDelivered: 1, errors: [] });
    expect(healed.tables.admin_notifications).toHaveLength(1);
    expect(sendPush).toHaveBeenCalledTimes(1);

    // the source path succeeding later (or a second worker) is a no-op: UNIQUE(recipient, dedupe_key)
    const again = await createAdminNotification(healed as never, input, deps);
    expect(again).toMatchObject({ ok: true, created: 0, pushed: 0 });
    const rerun = await runAdminNotificationDeliveryWorker(healed as never, deps);
    expect(rerun).toMatchObject({ outboxClaimed: 0, pushClaimed: 0 });
    expect(healed.tables.admin_notifications).toHaveLength(1);
    expect(sendPush).toHaveBeenCalledTimes(1);
  });

  it("authority lookup error is a retryable failure (queued), not a silent skip", async () => {
    const sb = memoryDb();
    const r = await createAdminNotification(sb as never, input, {
      resolveAuthority: async () => {
        throw new Error("network");
      },
      sendPush: vi.fn(),
    });
    expect(r).toMatchObject({ ok: false, error: "authority_lookup_failed", queued: true });
    expect(sb.tables.admin_notifications ?? []).toHaveLength(0);
  });

  it("recipient revoked while the event waits in the outbox → no row, no push, outbox closed", async () => {
    const sb = memoryDb({}, { failInsertInto: new Set(["admin_notifications"]) });
    await createAdminNotification(sb as never, input, { resolveAuthority: async () => SUPER, sendPush: vi.fn() });
    const healed = memoryDb({ admin_notification_outbox: sb.tables.admin_notification_outbox });
    const sendPush = vi.fn(async () => "sent" as const);
    const run = await runAdminNotificationDeliveryWorker(healed as never, { resolveAuthority: async () => REVOKED, sendPush });
    expect(run).toMatchObject({ outboxDelivered: 1 });
    expect(healed.tables.admin_notifications ?? []).toHaveLength(0);
    expect(sendPush).not.toHaveBeenCalled();
  });

  it("persistent failure is bounded: dead after max attempts and surfaced by health", async () => {
    const sb = memoryDb({}, { failInsertInto: new Set(["admin_notifications"]) });
    const deps = { resolveAuthority: async () => SUPER, sendPush: vi.fn() };
    await createAdminNotification(sb as never, input, deps);
    let dead = 0;
    for (let i = 0; i < 20; i += 1) dead += (await runAdminNotificationDeliveryWorker(sb as never, deps)).outboxDead;
    expect(dead).toBe(1);
    expect(sb.tables.admin_notification_outbox[0]).toMatchObject({ status: "dead", attempts: 8 });
    const h = await loadAdminNotificationDeliveryHealth(sb as never);
    expect(h).toEqual({ ok: true, health: { outboxDead: 1, outboxPending: 0, pushDead: 0, pushUnknown: 0 } });
  });

  it("push: retryable failure retried; a send with unknown outcome is never resent", async () => {
    const sb = memoryDb();
    const sendPush = vi.fn(async (): Promise<"sent" | "retryable"> => "retryable");
    const deps = { resolveAuthority: async () => SUPER, sendPush };
    await createAdminNotification(sb as never, input, deps);
    expect(sb.tables.admin_notification_push_deliveries[0]).toMatchObject({ status: "retry", attempts: 1 });
    sendPush.mockImplementation(async () => "sent" as const);
    const run = await runAdminNotificationDeliveryWorker(sb as never, deps);
    expect(run).toMatchObject({ pushClaimed: 1, pushSent: 1 });
    expect(sb.tables.admin_notifications[0]?.push_status).toBe("sent");

    // a delivery stuck in 'sending' (worker died mid-send) → unknown_outcome, not re-pushed
    sb.tables.admin_notification_push_deliveries.push({ notification_id: "ghost", status: "sending", stale: true, attempts: 1 });
    const calls = sendPush.mock.calls.length;
    const run2 = await runAdminNotificationDeliveryWorker(sb as never, deps);
    expect(run2.pushClaimed).toBe(0);
    expect(sendPush.mock.calls.length).toBe(calls);
    expect((await loadAdminNotificationDeliveryHealth(sb as never)).ok && (await loadAdminNotificationDeliveryHealth(sb as never))).toMatchObject({ health: { pushUnknown: 1 } });
  });

  it("push retry re-verifies authority: revoked before the retry → skipped, never sent", async () => {
    const sb = memoryDb();
    const sendPush = vi.fn(async (): Promise<"sent" | "retryable"> => "retryable");
    let authority: AdminRecipientAuthority = SUPER;
    const deps = { resolveAuthority: async () => authority, sendPush };
    await createAdminNotification(sb as never, input, deps);
    authority = REVOKED;
    const run = await runAdminNotificationDeliveryWorker(sb as never, deps);
    expect(run).toMatchObject({ pushClaimed: 1, pushSkipped: 1, pushSent: 0 });
    expect(sendPush).toHaveBeenCalledTimes(1);
    expect(sb.tables.admin_notifications[0]?.push_status).toBe("skipped_revoked");
  });

  it("delivery bookkeeping write failure → no blind push (duplicate risk avoided)", async () => {
    const sb = memoryDb({}, { failInsertInto: new Set(["admin_notification_push_deliveries"]) });
    const sendPush = vi.fn(async () => "sent" as const);
    const r = await createAdminNotification(sb as never, input, { resolveAuthority: async () => SUPER, sendPush });
    expect(r).toMatchObject({ ok: true, created: 1, pushed: 0 });
    expect(sendPush).not.toHaveBeenCalled();
  });
});

describe("R13-D migration / route contracts", () => {
  it("delivery migration: non-destructive, RLS on, functions service_role only, SKIP LOCKED claims", () => {
    const mig = read("supabase/migrations/20270509120000_admin_notification_delivery_recovery.sql");
    expect(mig).not.toMatch(/^\s*drop\s/im);
    expect(mig).not.toMatch(/create policy/i);
    expect(mig).toContain("enable row level security");
    expect(mig).toContain("revoke all on public.admin_notification_outbox from anon, authenticated");
    expect(mig).toContain("revoke all on function %s from anon, authenticated");
    expect(mig).toContain("grant execute on function %s to service_role");
    expect(mig.match(/for update skip locked/g)?.length).toBe(2);
    expect(mig).toContain("constraint admin_notification_outbox_source_key unique (source_key)");
    expect(mig).toContain("status = 'unknown_outcome'");
  });

  it("cron route requires CRON_SECRET and keeps the 90-day archive behind a separate flag", () => {
    const route = read("app/api/cron/admin-notification-delivery/route.ts");
    expect(route).toContain("verifyCronRequestAuthorization(req, secret)");
    expect(route).toContain('cron_secret_not_configured');
    expect(route).toContain('process.env.ADMIN_NOTIFICATION_ARCHIVE_ENABLED === "1"');
    const vercel = JSON.parse(read("vercel.json")) as { crons: { path: string }[] };
    expect(vercel.crons.some((c) => c.path === "/api/cron/admin-notification-delivery")).toBe(true);
  });

  it("delivery health is exposed to super admins only", () => {
    const route = read("app/api/admin/inbox/route.ts");
    expect(route).toMatch(/if \(gate\.actor\.isSuperAdmin\) \{\s*const h = await loadAdminNotificationDeliveryHealth/);
  });
});
