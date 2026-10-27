/**
 * 재감사 D-7 (P-10) — 알림센터 삭제(개별·선택·읽은 알림·전체)는 행마다 select + update 를 반복하지 않고
 * `soft_dismiss_notification_events` 한 번(500건 단위)으로 기록한다. 대상 선택은 TS 회원 A 판정 그대로.
 */
import { beforeEach, describe, expect, it, vi } from "vitest";
import type { SupabaseClient } from "@supabase/supabase-js";

vi.mock("@/lib/notifications/badge-authority-rebuild/member-notification-a-eligibility", async (orig) => ({
  ...(await orig<object>()),
  isMemberNotificationAListItem: (row: { type?: string }) => row.type !== "chat_message",
}));
vi.mock("@/lib/notifications/owner-dashboard-notifications-snapshot-refresh", () => ({
  refreshOwnerDashboardNotificationsSnapshotsNow: vi.fn(async () => {}),
}));
vi.mock("@/lib/notifications/notification-unread-count-cache", () => ({
  invalidateNotificationUnreadCountCache: vi.fn(),
}));
vi.mock("@/lib/notifications/pipeline/notify-badge-service", async (orig) => ({
  ...(await orig<object>()),
  invalidateNotificationBadgeCache: vi.fn(),
}));

import {
  dismissMemberNotificationCenterEvents,
  patchInboxNotificationIdsDelete,
} from "@/lib/notifications/inbox-read-bridge";

type Row = { id: string; type: string; unread: boolean; read_at: string | null; display_payload: object };

function fakeSb(rows: Row[], rpcError: string | null = null) {
  const writes: string[] = [];
  const rpc = vi.fn(async (_fn: string, args: { p_ids: string[] }) =>
    rpcError ? { data: null, error: { message: rpcError } } : { data: args.p_ids.filter((id) => rows.some((r) => r.id === id)).length, error: null }
  );
  const from = (table: string) => {
    let data: unknown[] = table === "notification_events" ? rows : [];
    const q: Record<string, unknown> = {};
    for (const m of ["select", "eq", "is", "order"]) q[m] = () => q;
    q.in = (_c: string, ids: string[]) => {
      data = data.filter((r) => ids.includes((r as Row).id));
      return q;
    };
    q.range = (a: number, b: number) => {
      data = data.slice(a, b + 1);
      return q;
    };
    q.update = () => {
      writes.push(table);
      return q;
    };
    q.then = (res: (v: unknown) => unknown) => res({ data, error: null });
    return q;
  };
  return { sb: { from, rpc } as unknown as SupabaseClient, rpc, writes };
}

const row = (id: string, type: string, unread: boolean): Row => ({
  id,
  type,
  unread,
  read_at: unread ? null : "2026-10-27T00:00:00.000Z",
  display_payload: {},
});

describe("D-7 bulk soft dismiss via RPC", () => {
  beforeEach(() => vi.clearAllMocks());

  it("delete-all: member A rows only, one RPC, no per-row update", async () => {
    const { sb, rpc, writes } = fakeSb([row("a1", "point", true), row("c1", "chat_message", true), row("a2", "point", false)]);
    const res = await dismissMemberNotificationCenterEvents(sb, "u1", "all");
    expect(res).toEqual({ ok: true, deleted: 2 });
    expect(rpc).toHaveBeenCalledTimes(1);
    expect(rpc).toHaveBeenCalledWith("soft_dismiss_notification_events", { p_user_id: "u1", p_ids: ["a1", "a2"] });
    expect(writes).toEqual([]);
  });

  it("delete-read: unread rows are kept", async () => {
    const { sb, rpc } = fakeSb([row("a1", "point", true), row("a2", "point", false)]);
    await dismissMemberNotificationCenterEvents(sb, "u1", "read_only");
    expect(rpc).toHaveBeenCalledWith("soft_dismiss_notification_events", { p_user_id: "u1", p_ids: ["a2"] });
  });

  it("chunks at 500 ids", async () => {
    const rows = Array.from({ length: 1001 }, (_, i) => row(`a${i}`, "point", true));
    const { sb, rpc } = fakeSb(rows);
    const res = await dismissMemberNotificationCenterEvents(sb, "u1", "all");
    expect(res).toEqual({ ok: true, deleted: 1001 });
    expect(rpc.mock.calls.map((c) => (c[1] as { p_ids: string[] }).p_ids.length)).toEqual([500, 500, 1]);
  });

  it("selected delete: one RPC, counts only rows the function stamped, no update", async () => {
    const { sb, rpc, writes } = fakeSb([row("a1", "point", true), row("a2", "point", true)]);
    const res = await patchInboxNotificationIdsDelete(sb, "u1", ["a1", "missing"]);
    expect(res).toEqual({ ok: true, deleted: 1 });
    expect(rpc).toHaveBeenCalledTimes(1);
    expect(writes).toEqual([]);
  });

  it("RPC failure is reported, not counted as deleted", async () => {
    const { sb } = fakeSb([row("a1", "point", true)], "boom");
    expect(await patchInboxNotificationIdsDelete(sb, "u1", ["a1"])).toEqual({ ok: false, error: "boom" });
    expect(await dismissMemberNotificationCenterEvents(sb, "u1", "all")).toEqual({ ok: false, error: "boom" });
  });
});
