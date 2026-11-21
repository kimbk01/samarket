/**
 * 2026-11-21 보내기 3단계 — 받는 사람 전원 발송 전 사실 묶음 읽기 = 기존 사람별 판정과 같은 결과.
 */
import { describe, expect, it, vi } from "vitest";
import { loadChatPushFactsBatch } from "@/lib/push/dispatch/chat-push-facts-batch";

type Res = { data: unknown; error: unknown };
function fakeSvc(byTable: Record<string, Res | ((filters: Record<string, unknown>) => Res)>) {
  const calls: string[] = [];
  const svc = {
    from: vi.fn((table: string) => {
      calls.push(table);
      const filters: Record<string, unknown> = {};
      const chain: Record<string, unknown> = {};
      for (const m of ["select", "or", "not", "order", "is"]) chain[m] = () => chain;
      chain.eq = (k: string, v: unknown) => ((filters[k] = v), chain);
      chain.in = (k: string, v: unknown) => ((filters[`in:${k}`] = v), chain);
      const res = () => {
        const h = byTable[table];
        return typeof h === "function" ? h(filters) : (h ?? { data: [], error: null });
      };
      chain.maybeSingle = async () => {
        const r = res();
        const d = Array.isArray(r.data) ? (r.data[0] ?? null) : r.data;
        return { data: d, error: r.error };
      };
      chain.then = (ok: (v: Res) => unknown, bad?: (e: unknown) => unknown) => Promise.resolve(res()).then(ok, bad);
      return chain;
    }),
  };
  return { svc: svc as never, calls };
}

const now = Date.parse("2026-11-21T00:00:10Z");
const ev = (id: string, user: string, type = "group_message") => ({
  id,
  user_id: user,
  type,
  room_id: "room-1",
  actor_user_id: "sender",
  created_at: "2026-11-21T00:00:00Z",
  display_payload: {},
});

describe("보내기 3단계 — 발송 전 사실 묶음 읽기", () => {
  it("받는 사람 3명이어도 표마다 1번 · 결과는 사람별 판정 규칙대로", async () => {
    const rows = [ev("e1", "u1"), ev("e2", "u2"), ev("e3", "u3")];
    const { svc, calls } = fakeSvc({
      notification_events: { data: rows, error: null },
      user_social_relations: {
        data: [{ owner_user_id: "u2", target_user_id: "sender", relation_type: "blocked", is_active: true }],
        error: null,
      },
      community_messenger_rooms: { data: { id: "room-1", room_type: "private_group", room_status: "active", deleted_at: null }, error: null },
      community_messenger_participants: {
        data: [
          { user_id: "u1", left_at: null },
          { user_id: "u2", left_at: null },
          { user_id: "u3", left_at: null },
        ],
        error: null,
      },
      community_messenger_group_bans: { data: [{ id: "b", user_id: "u3" }], error: null },
      user_devices: {
        data: [{ user_id: "u1", id: "d1", platform: "android", device_id: "x", push_token: "tok1", push_provider: "fcm", environment: "production" }],
        error: null,
      },
    });
    const facts = await loadChatPushFactsBatch(svc, rows as never, { nowMs: now, environment: "production" });
    expect(facts!.get("e1")!.safety).toEqual({ allow: true });
    expect(facts!.get("e2")!.safety).toEqual({ allow: false, reason: "blocked" });
    expect(facts!.get("e3")!.safety).toEqual({ allow: false, reason: "group_banned" });
    expect(facts!.get("e1")!.targets.length).toBe(1);
    expect(facts!.get("e2")!.targets.length).toBe(0);
    const counts = calls.reduce<Record<string, number>>((m, t) => ((m[t] = (m[t] ?? 0) + 1), m), {});
    for (const t of [
      "notification_events",
      "user_social_relations",
      "community_messenger_rooms",
      "community_messenger_participants",
      "community_messenger_group_bans",
      "user_notification_settings",
      "user_settings",
      "owner_notification_settings",
      "admin_notification_preferences",
      "user_devices",
      "web_push_subscriptions",
    ]) {
      expect(counts[t]).toBe(1);
    }
  });

  it("나간 사람 → group_membership_inactive · 방 삭제 → destination_deleted · 만료 → event_expired", async () => {
    const rows = [ev("e1", "u1"), ev("e2", "u2")];
    const { svc } = fakeSvc({
      notification_events: { data: rows, error: null },
      community_messenger_rooms: { data: { id: "room-1", room_type: "private_group", room_status: "active", deleted_at: null }, error: null },
      community_messenger_participants: { data: [{ user_id: "u1", left_at: "2026-11-20T00:00:00Z" }], error: null },
    });
    const f = await loadChatPushFactsBatch(svc, rows as never, { nowMs: now, environment: "production" });
    expect(f!.get("e1")!.safety).toEqual({ allow: false, reason: "group_membership_inactive" });
    expect(f!.get("e2")!.safety).toEqual({ allow: false, reason: "group_membership_inactive" });

    const { svc: svc2 } = fakeSvc({
      notification_events: { data: rows, error: null },
      community_messenger_rooms: { data: { id: "room-1", room_type: "private_group", room_status: "active", deleted_at: "2026-11-20" }, error: null },
    });
    const f2 = await loadChatPushFactsBatch(svc2, rows as never, { nowMs: now, environment: "production" });
    expect(f2!.get("e1")!.safety).toEqual({ allow: false, reason: "destination_deleted" });

    const { svc: svc3 } = fakeSvc({ notification_events: { data: rows, error: null } });
    const f3 = await loadChatPushFactsBatch(svc3, rows as never, { nowMs: now + 10 * 365 * 86400_000, environment: "production" });
    expect(f3!.get("e1")!.safety).toEqual({ allow: false, reason: "event_expired" });
  });

  it("설정: 사람당 행 2개 이상 또는 읽기 오류 → 설정 읽기 실패 · 표 없음 → 행 없음", async () => {
    const rows = [ev("e1", "u1", "chat_message"), ev("e2", "u2", "chat_message")];
    const { svc } = fakeSvc({
      notification_events: { data: rows, error: null },
      community_messenger_rooms: { data: { id: "room-1", room_type: "direct", room_status: "active", deleted_at: null }, error: null },
      community_messenger_participants: { data: [{ user_id: "u1", left_at: null }, { user_id: "u2", left_at: null }], error: null },
      user_settings: { data: [{ user_id: "u1" }, { user_id: "u1" }], error: null },
      owner_notification_settings: { data: null, error: { code: "42P01", message: "relation does not exist" } },
    });
    const f = await loadChatPushFactsBatch(svc, rows as never, { nowMs: now, environment: "production" });
    expect(f!.get("e1")!.preferences).toEqual({ readFailed: true });
    expect("snapshot" in f!.get("e2")!.preferences).toBe(true);
  });

  it("알림 행이 없거나 다른 사람 것이면 eventRow null(기존: 건너뜀) · 행 읽기 오류면 null(기존 경로)", async () => {
    const rows = [ev("e1", "u1"), ev("e2", "u2")];
    const { svc } = fakeSvc({ notification_events: { data: [{ ...ev("e1", "someone-else") }], error: null } });
    const f = await loadChatPushFactsBatch(svc, rows as never, { nowMs: now, environment: "production" });
    expect(f!.get("e1")!.eventRow).toBeNull();
    expect(f!.get("e2")!.eventRow).toBeNull();
    const { svc: bad } = fakeSvc({ notification_events: { data: null, error: { message: "x" } } });
    expect(await loadChatPushFactsBatch(bad, rows as never, { nowMs: now })).toBeNull();
  });
});
