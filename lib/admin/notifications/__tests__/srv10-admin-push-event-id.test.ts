import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));

const dispatchPushForUser = vi.fn(async (_out: unknown, _opts: Record<string, unknown>) => ({
  ok: true,
  outcome: "sent" as const,
  targets_found: 1,
  deliveries: [],
}));
vi.mock("@/lib/push/dispatch/dispatch-push-for-user", () => ({
  dispatchPushForUser: (out: unknown, opts: Record<string, unknown>) => dispatchPushForUser(out, opts),
}));
vi.mock("@/lib/notifications/pipeline/notify-badge-service", () => ({
  fetchDomainBadgeAuthorityPayload: async () => ({ memberAppIconWebTotal: 3, projection: { appIconTotal: 3 } }),
}));

type Row = Record<string, unknown>;

/** Minimal fake: admin_notifications upsert, push delivery insert, push_finish RPC. */
function fakeDb() {
  const tables: Record<string, Row[]> = { admin_notifications: [], admin_notification_push_deliveries: [] };
  const finishes: Row[] = [];
  return {
    tables,
    finishes,
    from(table: string) {
      let rows: Row[] = [];
      let conflict: string[] = [];
      const b: Record<string, unknown> = {
        upsert: (r: Row[], o: { onConflict: string }) => ((rows = r), (conflict = o.onConflict.split(",")), b),
        insert: (r: Row) => {
          tables[table].push(r);
          return Promise.resolve({ error: null });
        },
        select: () => b,
        then: (resolve: (v: unknown) => unknown) => {
          const inserted: Row[] = [];
          for (const r of rows) {
            if (tables[table].some((x) => conflict.every((c) => x[c] === r[c]))) continue;
            const row = { id: `00000000-0000-4000-8000-00000000000${tables[table].length + 1}`, created_at: "2026-10-18T00:00:00Z", read_at: null, archived_at: null, ...r };
            tables[table].push(row);
            inserted.push(row);
          }
          return resolve({ data: inserted, error: null });
        },
      };
      return b;
    },
    rpc(fn: string, args: Row) {
      if (fn === "admin_notification_push_finish") finishes.push(args);
      return Promise.resolve({ data: "sent", error: null });
    },
  };
}

const SUPER = { active: true as const, isSuperAdmin: true, permissions: [] };

describe("SRV-10 admin work push — event id", () => {
  beforeEach(() => dispatchPushForUser.mockClear());

  it("default sender passes no notification_event_id (admin rows are not notification_events)", async () => {
    const { createAdminNotification } = await import("@/lib/admin/notifications/admin-notification-service");
    const sb = fakeDb();
    const res = await createAdminNotification(sb as never, {
      recipientAdminIds: ["admin-a"],
      kind: "support_customer_replied",
      title: "문의 S-1",
      dedupeKey: "support:S-1:m1",
      push: true,
    }, { resolveAuthority: async () => SUPER });

    expect(res).toMatchObject({ ok: true, created: 1, pushed: 1 });
    expect(dispatchPushForUser).toHaveBeenCalledTimes(1);
    const [out, opts] = dispatchPushForUser.mock.calls[0];
    expect(opts.notification_event_id).toBeUndefined();
    expect(String(JSON.stringify(opts))).not.toMatch(/admin:/);
    const rowId = sb.tables.admin_notifications[0].id;
    expect(opts).toMatchObject({ event_type: "support_customer_replied", target_type: "admin_notification", target_id: rowId });
    expect(out).toMatchObject({ user_id: "admin-a", meta: { admin_notification_id: rowId } });
    expect(sb.finishes[0]).toMatchObject({ p_notification_id: rowId, p_result: "sent" });
  });

  it("same dedupe key → no second row, no second push", async () => {
    const { createAdminNotification } = await import("@/lib/admin/notifications/admin-notification-service");
    const sb = fakeDb();
    const input = {
      recipientAdminIds: ["admin-a"],
      kind: "support_customer_replied",
      title: "문의 S-1",
      dedupeKey: "support:S-1:m1",
      push: true,
    };
    await createAdminNotification(sb as never, input, { resolveAuthority: async () => SUPER });
    const again = await createAdminNotification(sb as never, input, { resolveAuthority: async () => SUPER });
    expect(again).toMatchObject({ ok: true, created: 0, pushed: 0 });
    expect(dispatchPushForUser).toHaveBeenCalledTimes(1);
  });

  it("revoked admin at send time → no push", async () => {
    const { createAdminNotification } = await import("@/lib/admin/notifications/admin-notification-service");
    const sb = fakeDb();
    let calls = 0;
    const res = await createAdminNotification(sb as never, {
      recipientAdminIds: ["admin-a"],
      kind: "support_customer_replied",
      title: "문의 S-2",
      dedupeKey: "support:S-2:m1",
      push: true,
    }, { resolveAuthority: async () => (++calls === 1 ? SUPER : { active: false }) });
    expect(res).toMatchObject({ ok: true, created: 1, pushed: 0 });
    expect(dispatchPushForUser).not.toHaveBeenCalled();
    expect(sb.finishes[0]).toMatchObject({ p_result: "skipped_revoked" });
  });
});
