/**
 * Auth HARD LOCK Amendment 2026-11-25 — 관리자 API 인증 확인 1회 조회.
 * - 모두 통과할 때만 DB 함수 1번으로 끝난다(기존 3단계 경로 0번).
 * - 하나라도 통과 못 하면 기존 3단계 경로 그대로 → 거부 응답·등록 보완·프로필 생성이 예전과 같다.
 */
import { beforeEach, describe, expect, it, vi } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";

const state = vi.hoisted(() => ({
  rpcCalls: 0,
  rpcResult: null as null | { data?: unknown; error?: { message: string } | null },
  cookie: "sess-1" as string | null,
  legacyCalls: 0,
}));

vi.mock("@/lib/auth/server-guards", () => ({
  requireAuth: async () => ({ ok: true, userId: "u-1" }),
  validateActiveSession: async () => {
    state.legacyCalls += 1;
    return { ok: true, profile: { id: "u-1", status: "verified_user" } };
  },
  requireAdmin: async () => ({
    ok: true,
    profile: { id: "u-1", status: "verified_user" },
    membership: { id: "m-legacy", role: "admin", admin_tier: "operator" },
  }),
}));
vi.mock("@/lib/auth/active-session", () => ({
  readActiveSessionIdCookie: async () => state.cookie,
}));
vi.mock("@/lib/auth/get-optional-authenticated-user-id", () => ({
  getOptionalAuthenticatedUserId: async () => "u-1",
}));
vi.mock("@/lib/supabase/try-supabase-server", () => ({
  tryCreateSupabaseServiceClient: () => ({
    rpc: async (name: string, args: Record<string, unknown>) => {
      state.rpcCalls += 1;
      expect(name).toBe("admin_api_actor_context");
      expect(args).toEqual({ p_user_id: "u-1", p_session_id: "sess-1" });
      return state.rpcResult ?? { data: null, error: { message: "not_set" } };
    },
  }),
}));

import { requireAdminApiUser } from "@/lib/admin/require-admin-api";
import { PROFILE_SELECT_FULL_COLUMNS } from "@/lib/profile/fetch-profile-row-safe";
import { resolveLoginDeniedForMemberAccount } from "@/lib/auth/member-account-state";

const GOOD = {
  profile: { id: "u-1", status: "verified_user", nickname: "관리자", phone_verified: true },
  session: { active: true, invalidation_reason: null as string | null },
  membership: { id: "m-1", user_id: "u-1", role: "admin", status: "active", admin_tier: "operator" },
};

function ok(over: Partial<typeof GOOD> = {}) {
  return { data: { ...GOOD, ...over }, error: null };
}

describe("requireAdminApiUser — 인증 확인 1회 조회", () => {
  beforeEach(() => {
    state.rpcCalls = 0;
    state.legacyCalls = 0;
    state.cookie = "sess-1";
    state.rpcResult = ok();
  });

  it("모두 통과 → DB 함수 1번, 기존 3단계 경로 0번 · 같은 모양 반환", async () => {
    const r = await requireAdminApiUser();
    expect(r.ok).toBe(true);
    expect(state.rpcCalls).toBe(1);
    expect(state.legacyCalls).toBe(0);
    if (r.ok) {
      expect(r.userId).toBe("u-1");
      expect(r.membership.id).toBe("m-1");
      expect(r.profile.id).toBe("u-1");
      expect(r.profile.nickname).toBe("관리자");
    }
  });

  it.each([
    ["DB 함수 오류(배포 전·권한)", { data: null, error: { message: "function does not exist" } }],
    ["프로필 없음", ok({ profile: null as never })],
    ["세션 등록 없음", ok({ session: null as never })],
    ["세션 비활성", ok({ session: { active: false, invalidation_reason: "global_signout" } })],
    ["활성 관리자 아님", ok({ membership: null as never })],
    ["관리자 아닌 역할", ok({ membership: { ...GOOD.membership, role: "member" } })],
    ["형식 이상", { data: "x", error: null }],
  ])("%s → 기존 3단계 경로 그대로", async (_label, result) => {
    state.rpcResult = result as never;
    const r = await requireAdminApiUser();
    expect(state.rpcCalls).toBe(1);
    expect(state.legacyCalls).toBe(1);
    expect(r.ok).toBe(true); // 기존 경로 흉내가 통과 — 결과는 기존 경로가 정한다
    if (r.ok) expect(r.membership.id).toBe("m-legacy");
  });

  it("로그인 금지 상태 프로필 → 기존 경로(예전과 같은 거부 응답을 기존 경로가 만든다)", async () => {
    const blocked = { ...GOOD.profile, status: "blocked" };
    expect(resolveLoginDeniedForMemberAccount(blocked as never)).not.toBeNull();
    state.rpcResult = ok({ profile: blocked });
    await requireAdminApiUser();
    expect(state.legacyCalls).toBe(1);
  });

  it("정지 운영자(최고관리자 아님) → 기존 경로 · 정지 최고관리자는 빠른 경로 통과", async () => {
    state.rpcResult = ok({ profile: { ...GOOD.profile, status: "suspended" } });
    await requireAdminApiUser();
    expect(state.legacyCalls).toBe(1);

    state.legacyCalls = 0;
    state.rpcResult = ok({
      profile: { ...GOOD.profile, status: "suspended" },
      membership: { ...GOOD.membership, role: "super_admin" },
    });
    const r = await requireAdminApiUser();
    expect(state.legacyCalls).toBe(0);
    expect(r.ok).toBe(true);
  });

  it("세션 쿠키 없음 → DB 함수 부르지 않고 기존 경로", async () => {
    state.cookie = null;
    await requireAdminApiUser();
    expect(state.rpcCalls).toBe(0);
    expect(state.legacyCalls).toBe(1);
  });
});

describe("admin_api_actor_context 마이그레이션 계약", () => {
  const sql = readFileSync(
    join(process.cwd(), "supabase/migrations/20271125100000_admin_api_actor_context.sql"),
    "utf8"
  );

  it("프로필 열 = fetchProfileRowSafe SELECT_FULL (한쪽만 바꾸면 실패)", () => {
    const m = sql.match(/select (id, email[\s\S]*?)\n\s+from public\.profiles/);
    expect(m).not.toBeNull();
    const norm = (s: string) => s.split(",").map((x) => x.trim()).filter(Boolean);
    expect(norm(m![1])).toEqual(norm(PROFILE_SELECT_FULL_COLUMNS));
  });

  it("세션 조건 = user_id + session_id · membership 조건 = user_id + status active", () => {
    expect(sql).toMatch(/where s\.user_id = p_user_id\s+and s\.session_id = /);
    expect(sql).toMatch(/where user_id = p_user_id\s+and status = 'active'/);
  });

  it("실행 권한 service_role 만 · security invoker", () => {
    expect(sql).toContain("security invoker");
    expect(sql).toContain(
      "revoke all on function public.admin_api_actor_context(uuid, text) from public, anon, authenticated;"
    );
    expect(sql).toContain("grant execute on function public.admin_api_actor_context(uuid, text) to service_role;");
  });
});
