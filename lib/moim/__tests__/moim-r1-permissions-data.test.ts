import { readFileSync } from "node:fs";
import { beforeEach, describe, expect, it, vi } from "vitest";

/**
 * 모임 R1 — 권한·데이터 (docs/audit/moim-r1-design-2026-11-28.md)
 * DB 동작은 로컬 Postgres 시나리오(docs/audit/moim-r1-local-verify-scenarios-2026-11-28.sql, 수정 전/후 결과는 PR 본문).
 * 여기서는 TS 쪽 동작: 권한 상한(TS = SQL), 수락 검사, 신고 상한, 쪽 넘김 커서, 공개 일정 미리보기, 어드민 「본 값」 전달.
 */

vi.mock("server-only", () => ({}));

const R1_SQL = readFileSync("supabase/migrations/20271128210000_moim_r1_permissions_data.sql", "utf8");

beforeEach(() => vi.clearAllMocks());

describe("A-02 권한 조정 상한 — TS = SQL moim_permission_ceiling", () => {
  it("상한 값이 SQL 과 같고, 조정 칸만 움직인다", async () => {
    const { MOIM_PERMISSION_DEFAULTS, isAllowedMoimPermissionOverride } = await import("@/lib/moim/moim-permission-contract");
    /** 운영에 마지막으로 정의된 moim_permission_ceiling (뒤 마이그레이션이 앞 정의를 바꾼다 — R3 Q2 start_dm) */
    const { readdirSync, readFileSync } = await import("node:fs");
    const { join } = await import("node:path");
    const dir = join(process.cwd(), "supabase/migrations");
    let body = "";
    for (const f of readdirSync(dir).filter((x) => x.endsWith(".sql")).sort()) {
      const sql = readFileSync(join(dir, f), "utf8");
      const i = sql.indexOf("function public.moim_permission_ceiling");
      if (i >= 0) body = sql.slice(i, sql.indexOf("else null end;", i));
    }
    const sqlCeil = new Map([...body.matchAll(/when '([a-z_]+)' then '([a-z_]+)'/g)].map((m) => [m[1], m[2]]));
    for (const [action, rule] of Object.entries(MOIM_PERMISSION_DEFAULTS)) {
      if (rule.adjustable) expect(rule.ceilingRole, action).toBe(sqlCeil.get(action));
    }
    expect(isAllowedMoimPermissionOverride("decide_join", "host")).toBe(false);
    expect(isAllowedMoimPermissionOverride("decide_join", "co_host")).toBe(true);
    expect(isAllowedMoimPermissionOverride("send_invite", "co_host")).toBe(false);
    expect(isAllowedMoimPermissionOverride("send_invite", "staff")).toBe(true);
    expect(isAllowedMoimPermissionOverride("write_note", "host")).toBe(true);
  });

  it("예전 저장값이 상한을 넘어도 부모임장의 고정 권한은 남는다", async () => {
    const { canMoimAction } = await import("@/lib/moim/moim-permission-contract");
    const ctx = { moimStatus: "active", platformState: "normal", viewerRole: "co_host", overrides: { decide_join: "host" } } as never;
    expect(canMoimAction(ctx, "decide_join")).toBe(true);
  });
});

describe("A-09 초대 수락·위임 수락 = 가입 버튼과 같은 이용 제한 검사", () => {
  async function callRoute(path: "invite" | "transfer", accept: boolean, restricted: boolean) {
    vi.resetModules();
    const respond = vi.fn(async () => ({ ok: true }));
    vi.doMock("@/lib/moim/server/moim-route-guard.server", async () => {
      const actual = await vi.importActual<Record<string, unknown>>("@/lib/moim/server/moim-route-guard.server");
      const { NextResponse } = await import("next/server");
      return {
        ...actual,
        guardMoimWrite: async () => ({ ok: true, userId: "u1", sb: {} }),
        guardMoimAcceptGate: async () => (restricted ? NextResponse.json({ ok: false, error: "community_restricted" }, { status: 403 }) : null),
      };
    });
    vi.doMock("@/lib/auth/require-registration-for-action.server", () => ({ requireRegistrationForAction: async () => null }));
    /** R5 B5: 초대 수락 분기는 라우트가 약관을 확인한다(거절은 동의 예외) — 이 시험은 이용 제한만 보므로 약관은 통과 */
    vi.doMock("@/lib/auth/require-signup-complete-api", () => ({ requireSignupCompleteForUser: async () => ({ ok: true }) }));
    vi.doMock("@/lib/moim/server/moim-rpc.server", async () => {
      const actual = await vi.importActual<Record<string, unknown>>("@/lib/moim/server/moim-rpc.server");
      return { ...actual, moimInviteRespond: respond, moimHostTransferRespond: respond };
    });
    const { NextRequest } = await import("next/server");
    const id = "11111111-1111-4111-8111-111111111111";
    const mod =
      path === "invite"
        ? await import("@/app/api/moim/invites/[inviteId]/route")
        : await import("@/app/api/moim/host-transfers/[transferId]/route");
    const req = new NextRequest(`https://x.test/api/moim/${path}/${id}`, { method: "POST", body: JSON.stringify({ accept }) });
    const res = await (mod.POST as (r: unknown, c: unknown) => Promise<Response>)(req, {
      params: Promise.resolve(path === "invite" ? { inviteId: id } : { transferId: id }),
    });
    return { res, respond };
  }

  it("제한된 사용자의 초대 수락·위임 수락은 403, RPC 를 부르지 않는다", async () => {
    for (const path of ["invite", "transfer"] as const) {
      const { res, respond } = await callRoute(path, true, true);
      expect(res.status, path).toBe(403);
      expect(respond, path).not.toHaveBeenCalled();
    }
  });

  it("거절은 검사하지 않는다", async () => {
    for (const path of ["invite", "transfer"] as const) {
      const { respond } = await callRoute(path, false, true);
      expect(respond, path).toHaveBeenCalled();
    }
  });
});

describe("A-14 모임 신고 = 공통 신고 상한", () => {
  it("상한을 넘으면 RPC 전에 거절한다", async () => {
    vi.resetModules();
    const create = vi.fn(async () => ({ ok: true }));
    vi.doMock("@/lib/moim/server/moim-route-guard.server", async () => {
      const actual = await vi.importActual<Record<string, unknown>>("@/lib/moim/server/moim-route-guard.server");
      return { ...actual, guardMoimWrite: async () => ({ ok: true, userId: "u1", sb: {} }) };
    });
    vi.doMock("@/lib/security/rate-limit-presets", async () => {
      const { NextResponse } = await import("next/server");
      return { enforceUserReportQuota: vi.fn(async () => ({ ok: false, response: NextResponse.json({ ok: false, error: "report_rate_limited" }, { status: 429 }) })) };
    });
    vi.doMock("@/lib/moim/server/moim-rpc.server", async () => {
      const actual = await vi.importActual<Record<string, unknown>>("@/lib/moim/server/moim-rpc.server");
      return { ...actual, moimReportCreate: create };
    });
    const { NextRequest } = await import("next/server");
    const { POST } = await import("@/app/api/moim/[moimId]/reports/route");
    const res = await POST(
      new NextRequest("https://x.test/api/moim/m/reports", { method: "POST", body: JSON.stringify({ targetType: "post", targetId: "11111111-1111-4111-8111-111111111111", reasonCode: "commercial" }) }),
      { params: Promise.resolve({ moimId: "22222222-2222-4222-8222-222222222222" }) }
    );
    expect(res.status).toBe(429);
    expect(create).not.toHaveBeenCalled();
  });
});

describe("A-19 쪽 넘김 커서 「시각|id」", () => {
  it("해석·적용·생성", async () => {
    const { parseMoimTimeCursor, applyMoimTimeCursor, moimTimeCursorOf } = await import("@/lib/moim/server/moim-time-cursor.server");
    expect(parseMoimTimeCursor(null)).toBeNull();
    expect(parseMoimTimeCursor("2026-11-28T03:00:00.123456+00:00")).toEqual({ ts: "2026-11-28T03:00:00.123456+00:00", id: null });
    expect(parseMoimTimeCursor("2026-11-28T03:00:00Z|11111111-1111-4111-8111-111111111111")).toEqual({ ts: "2026-11-28T03:00:00Z", id: "11111111-1111-4111-8111-111111111111" });
    expect(parseMoimTimeCursor("not-a-date")).toBe("invalid");
    expect(parseMoimTimeCursor("2026-11-28T03:00:00Z|x),or(")).toBe("invalid");
    const calls: string[] = [];
    const q = { lt: (c: string, v: string) => (calls.push(`lt ${c} ${v}`), q), or: (e: string) => (calls.push(`or ${e}`), q) };
    applyMoimTimeCursor(q, "created_at", { ts: "2026-11-28T03:00:00Z", id: "11111111-1111-4111-8111-111111111111" });
    expect(calls).toEqual([`or created_at.lt."2026-11-28T03:00:00Z",and(created_at.eq."2026-11-28T03:00:00Z",id.lt.11111111-1111-4111-8111-111111111111)`]);
    expect(moimTimeCursorOf({ id: "a", created_at: "t" }, "created_at")).toBe("t|a");
  });

  it("검색어와 커서는 한 식으로 묶는다", async () => {
    const { listLocalMoims } = await import("@/lib/moim/server/moim-queries.server");
    const ors: string[] = [];
    const from = vi.fn(() => {
      const c: Record<string, unknown> = {};
      for (const m of ["select", "eq", "order", "limit", "gte", "lt", "maybeSingle"]) c[m] = () => c;
      c.or = (e: string) => (ors.push(e), c);
      c.then = (r: (v: unknown) => unknown) => r({ data: [], error: null });
      return c;
    });
    await listLocalMoims({ from } as never, "u1", { lguId: "1381300000", q: "run", before: "2026-11-28T03:00:00Z|11111111-1111-4111-8111-111111111111" } as never);
    expect(ors).toHaveLength(1);
    expect(ors[0]).toMatch(/^and\(or\(name\.ilike\.%run%.*\),or\(last_activity_at\.lt\."2026-11-28T03:00:00Z",and\(/);
  });

  it("잘못된 커서는 DB 에 보내지 않고 빈 쪽", async () => {
    const { listLocalMoims } = await import("@/lib/moim/server/moim-queries.server");
    const from = vi.fn(() => {
      const c: Record<string, unknown> = {};
      for (const m of ["select", "eq", "order", "limit", "gte", "or", "lt", "maybeSingle"]) c[m] = () => c;
      c.then = (r: (v: unknown) => unknown) => r({ data: [], error: null });
      return c;
    });
    const out = await listLocalMoims({ from } as never, "u1", { lguId: "1381300000", before: "garbage" } as never);
    expect(out).toEqual({ items: [], nextBefore: null });
  });
});

describe("A-19 공개 「다가오는 일정」 미리보기 = 시작 전만", () => {
  it("starts_at > 지금 조건", async () => {
    const { listUpcomingScheduleTeasers } = await import("@/lib/moim/server/moim-schedule-queries.server");
    const filters: string[] = [];
    const c: Record<string, unknown> = {};
    for (const m of ["select", "eq", "in", "order", "limit"]) c[m] = () => c;
    c.gt = (col: string) => (filters.push(`gt ${col}`), c);
    c.then = (r: (v: unknown) => unknown) => r({ data: [], error: null });
    await listUpcomingScheduleTeasers({ from: () => c } as never, "m1");
    expect(filters).toEqual(["gt starts_at"]);
  });
});

describe("A-16·A-17 어드민 — 「본 값」·연결 신고 전달", () => {
  it("역할 변경·모임장 지정은 화면이 본 값을, 제재는 연결 신고를 RPC 로 넘긴다", async () => {
    vi.resetModules();
    const rpc = vi.fn(async () => ({ ok: true, changed: false, notify_user_ids: [] }));
    vi.doMock("@/lib/moim/server/moim-rpc.server", async () => {
      const actual = await vi.importActual<Record<string, unknown>>("@/lib/moim/server/moim-rpc.server");
      return { ...actual, moimAdminMemberRole: rpc, moimAdminAssignHost: rpc, moimAdminSanctionApply: rpc };
    });
    vi.doMock("@/lib/admin/require-admin-permission", () => ({ requireAdminPermission: async () => ({ ok: true, actor: { userId: "a1" }, sb: {} }) }));
    vi.doMock("@/lib/moim/server/moim-notify.server", async () => {
      const actual = await vi.importActual<Record<string, unknown>>("@/lib/moim/server/moim-notify.server");
      return { ...actual, notifyMoimMany: vi.fn(async () => undefined) };
    });
    const { NextRequest } = await import("next/server");
    const M = "22222222-2222-4222-8222-222222222222";
    const U = "33333333-3333-4333-8333-333333333333";
    const members = await import("@/app/api/admin/moim/moims/[moimId]/members/[userId]/route");
    await members.POST(new NextRequest("https://x.test/a", { method: "POST", body: JSON.stringify({ action: "role", role: "staff", reason: "reason text ok", expectedRole: "co_host" }) }), { params: Promise.resolve({ moimId: M, userId: U }) });
    expect(rpc.mock.calls[0]).toEqual(["a1", M, U, "staff", "reason text ok", {}, "co_host"]);
    const sanctions = await import("@/app/api/admin/moim/moims/[moimId]/sanctions/route");
    const bad = await sanctions.POST(new NextRequest("https://x.test/s", { method: "POST", body: JSON.stringify({ level: "warn", reasonCode: "commercial", reason: "reason text ok", reportId: "nope" }) }), { params: Promise.resolve({ moimId: M }) });
    expect(bad.status).toBe(404);
  });
});

describe("SQL 공용 함수를 모든 경로가 쓴다 (구조 확인 — 동작은 로컬 Postgres 시나리오)", () => {
  it("역할 방 반영 · 멤버 정리 · 모임 종료 정리 · 내용 검사", () => {
    const fn = (name: string) => {
      const i = R1_SQL.toUpperCase().indexOf(`FUNCTION PUBLIC.${name.toUpperCase()}(`);
      expect(i, name).toBeGreaterThan(-1);
      return R1_SQL.slice(i, R1_SQL.indexOf("$function$;", i));
    };
    for (const n of ["moim_member_role_set", "moim_admin_member_role", "moim__host_swap"]) expect(fn(n)).toContain("moim__sync_member_rooms");
    expect(fn("moim__deactivate_member")).toContain("moim__release_member");
    /** 재감사 H-1: 일정 방에서 모임장은 admin(co_host) — 방장은 일정 호스트 1명 */
    expect(fn("moim__sync_member_rooms")).toContain("case when v_room is distinct from v_main and v_role = 'host' then 'co_host' else v_role end");
    expect(fn("moim__schedule_confirm")).toContain("when public.moim_actor_role(v_s.moim_id, p_user) = 'host' then 'co_host'");
    for (const n of ["moim_close", "moim_admin_delete", "moim_account_cleanup"]) expect(fn(n)).toContain("moim__close_cleanup");
    for (const n of ["moim_post_create", "moim_post_update", "moim_schedule_create", "moim_schedule_update"]) {
      expect(fn(n)).toContain("moim__assert_images");
      expect(fn(n)).toContain("moim__assert_text_clean");
    }
  });
});
