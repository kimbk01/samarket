import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it, vi } from "vitest";
import {
  authorityAllows,
  countUnreadAdminNotifications,
  createAdminNotification,
  listAdminNotifications,
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
function memoryDb(seed: Record<string, Row[]> = {}) {
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
        update: (p: Row) => ((mode = "update"), (patch = p), b),
        insert: (rows: Row | Row[]) => ((mode = "insert"), (upsertRows = Array.isArray(rows) ? rows : [rows]), b),
        upsert: (rows: Row[], o: { onConflict: string }) => (
          (mode = "upsert"), (upsertRows = rows), (conflictCols = o.onConflict.split(",")), b
        ),
        then: (resolve: (r: unknown) => unknown) => {
          const t = tables[table];
          if (mode === "upsert" || mode === "insert") {
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
