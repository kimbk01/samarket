import { afterEach, describe, expect, it, vi } from "vitest";
import type { MoimRoomOwnerDto } from "@/app/api/moim/rooms/route";

/**
 * 모임 R5 A §2-1 — GET /api/moim/rooms (A9 · A11 · 신규2 · A16 사유 · A24 시각).
 * 고치기 전: 조회 오류를 버려 200 `ok:true owners:{}`(「모임 방 아님」으로 세션 끝까지 기억) · homeOpen/readonlyReason/scheduleStartsAt 없음.
 */

type Call = { table: string; select?: string; filters: string[] };

function fakeSb(tables: Record<string, unknown[]>, errors: Record<string, number[]> = {}) {
  const calls: Call[] = [];
  const nth: Record<string, number> = {};
  return {
    calls,
    from(table: string) {
      const entry: Call = { table, filters: [] };
      calls.push(entry);
      nth[table] = (nth[table] ?? 0) + 1;
      const failThis = (errors[table] ?? []).includes(nth[table]);
      const rows = tables[table] ?? [];
      const chain: Record<string, unknown> = {};
      chain.select = (cols?: string) => {
        entry.select = cols;
        return chain;
      };
      for (const m of ["eq", "is", "in", "or", "neq"]) {
        chain[m] = (col: string, v: unknown) => {
          entry.filters.push(`${m}:${col}=${Array.isArray(v) ? v.join("|") : String(v)}`);
          return chain;
        };
      }
      chain.then = (resolve: (v: unknown) => unknown) =>
        resolve(failThis ? { data: null, error: { message: "boom" } } : { data: rows, error: null });
      return chain;
    },
  };
}

const ROOM_A = "aaaaaaaa-1111-4111-8111-111111111111";
const ROOM_B = "bbbbbbbb-2222-4222-8222-222222222222";

async function callRoute(tables: Record<string, unknown[]>, errors: Record<string, number[]> = {}) {
  const sb = fakeSb(tables, errors);
  vi.resetModules();
  vi.doMock("@/lib/moim/server/moim-route-guard.server", async () => {
    const actual = await vi.importActual<object>("@/lib/moim/server/moim-route-guard.server");
    return { ...actual, guardMoimRead: async () => ({ ok: true, userId: "u1", sb }) };
  });
  const { GET } = await import("@/app/api/moim/rooms/route");
  const { NextRequest } = await import("next/server");
  const res = await GET(new NextRequest(`https://x.test/api/moim/rooms?ids=${ROOM_A},${ROOM_B}`));
  vi.doUnmock("@/lib/moim/server/moim-route-guard.server");
  return { status: res.status, body: (await res.json()) as { ok: boolean; error?: string; owners?: Record<string, MoimRoomOwnerDto> }, calls: sb.calls };
}

const moimRow = (over: Record<string, unknown> = {}) => ({
  id: "m1",
  name: "M",
  status: "active",
  platform_state: "normal",
  retention_ended_at: null,
  moim_members: [{ user_id: "u1", role: "member" }],
  moim_permissions: [],
  ...over,
});

const base = (moims: unknown[], schedules: unknown[] = [], rooms: unknown[] = [{ id: ROOM_A, owner_ref_id: "m1" }]) => ({
  community_messenger_participants: [{ room_id: ROOM_A }, { room_id: ROOM_B }],
  community_messenger_rooms: rooms,
  moims,
  moim_schedules: schedules,
});

describe("A11 · 신규2 — 조회 오류는 503 (「모임 방 아님」으로 답하지 않는다)", () => {
  afterEach(() => vi.resetModules());

  it.each([
    ["참여 행", { community_messenger_participants: [1] }],
    ["방", { community_messenger_rooms: [1] }],
    ["모임", { moims: [1] }],
    ["일정", { moim_schedules: [1] }],
  ])("%s 조회 오류 → 503 moim_rooms_unavailable (고치기 전 200 ok:true)", async (_label, errors) => {
    const out = await callRoute(base([moimRow()]), errors);
    expect(out.status).toBe(503);
    expect(out.body).toEqual({ ok: false, error: "moim_rooms_unavailable" });
  });

  it("일정 방의 빠진 모임 조회 오류도 503", async () => {
    const out = await callRoute(
      base([], [{ id: "s1", moim_id: "m9", status: "recruiting", starts_at: "2026-11-15T10:00:00Z" }], [{ id: ROOM_A, owner_ref_id: "s1" }]),
      { moims: [2] }
    );
    expect(out.status).toBe(503);
  });
});

describe("A9 · A16 · A24 — 같은 조회에 열만 더한다 (요청 수 그대로)", () => {
  afterEach(() => vi.resetModules());

  it("종료 + 열람 끝 모임 = homeOpen false (고치기 전: 「모임 홈」 보임) · 종료만 = true · 삭제 = false", async () => {
    const ended = await callRoute(base([moimRow({ status: "closed", retention_ended_at: "2026-11-20T00:00:00Z" })]));
    expect(ended.body.owners?.[ROOM_A]).toMatchObject({ homeOpen: false, readonlyReason: "moim_closed" });
    const closed = await callRoute(base([moimRow({ status: "closed" })]));
    expect(closed.body.owners?.[ROOM_A]).toMatchObject({ homeOpen: true, readonlyReason: "moim_closed" });
    const deleted = await callRoute(base([moimRow({ status: "deleted", platform_state: "blocked" })]));
    /** 앞쪽이 우선 — 삭제 > 차단 */
    expect(deleted.body.owners?.[ROOM_A]).toMatchObject({ homeOpen: false, readonlyReason: "moim_deleted" });
  });

  it("차단 모임 = moim_blocked · 활동 모임 = null", async () => {
    expect((await callRoute(base([moimRow({ platform_state: "blocked" })]))).body.owners?.[ROOM_A]).toMatchObject({
      homeOpen: true,
      readonlyReason: "moim_blocked",
    });
    expect((await callRoute(base([moimRow()]))).body.owners?.[ROOM_A]).toMatchObject({ homeOpen: true, readonlyReason: null, scheduleStartsAt: null });
  });

  it("끝난 일정 · 취소된 일정 = 각 사유 + 시작 시각", async () => {
    const rooms = [{ id: ROOM_A, owner_ref_id: "s1" }, { id: ROOM_B, owner_ref_id: "s2" }];
    const out = await callRoute(
      base(
        [moimRow()],
        [
          { id: "s1", moim_id: "m1", status: "done", starts_at: "2026-11-15T10:00:00Z" },
          { id: "s2", moim_id: "m1", status: "cancelled", starts_at: "2026-11-16T10:00:00Z" },
        ],
        rooms
      )
    );
    expect(out.body.owners?.[ROOM_A]).toMatchObject({ kind: "schedule", scheduleId: "s1", readonlyReason: "schedule_done", scheduleStartsAt: "2026-11-15T10:00:00Z" });
    expect(out.body.owners?.[ROOM_B]).toMatchObject({ readonlyReason: "schedule_cancelled", scheduleStartsAt: "2026-11-16T10:00:00Z" });
  });

  it("모임 행이 없으면(오류 없이 빈 결과) moimStatus null · homeOpen false", async () => {
    const out = await callRoute(base([]));
    expect(out.status).toBe(200);
    expect(out.body.owners?.[ROOM_A]).toMatchObject({ moimStatus: null, homeOpen: false });
  });

  it("요청 수 4 그대로 · 모임·일정 select 에 열만 더함", async () => {
    const out = await callRoute(base([moimRow()]));
    expect(out.calls.map((c) => c.table)).toEqual(["community_messenger_participants", "community_messenger_rooms", "moims", "moim_schedules"]);
    expect(out.calls.find((c) => c.table === "moims")?.select).toContain("retention_ended_at");
    expect(out.calls.find((c) => c.table === "moim_schedules")?.select).toBe("id, moim_id, status, starts_at");
  });
});
