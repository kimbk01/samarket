/**
 * 요청 증폭 근본 수정 2단계 2-A — 회원 쓰기 검사 DB 함수 1회.
 * 회원 상태·동의 행·관리자 역할을 `member_write_gate_snapshot` 1회로 읽고, 판정은 기존과 같다.
 * (P0-R3 캐시 금지·fail-closed, B3 동의 게이트, 관리자 동의 예외)
 */
import { beforeEach, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";

const V = "v-cms-1";
const db = vi.hoisted(() => ({
  result: { data: null as unknown, error: null as unknown },
  rpc: [] as { fn: string; args: unknown }[],
  from: 0,
}));

vi.mock("@/lib/auth/proxy-auth-session-cache", () => ({
  peekProxyAuthSessionCache: () => "user-gate-1",
  proxyAuthCookieFingerprint: () => "fp",
  setProxyAuthSessionCache: () => {},
}));
vi.mock("@/lib/supabase/try-supabase-server", () => ({
  tryCreateSupabaseServiceClient: () => ({
    rpc: async (fn: string, args: unknown) => {
      db.rpc.push({ fn, args });
      return db.result;
    },
    from: () => {
      db.from += 1;
      throw new Error("from() must not be called — gate reads one snapshot");
    },
  }),
}));
vi.mock("@/lib/legal/resolve-required-consent-versions", () => ({
  resolveRequiredConsentVersionsStrict: async () => ({ termsVersion: V, privacyVersion: V, source: "cms" }),
}));

import { enforceApiMemberMutationPolicy } from "@/lib/auth/enforce-api-member-mutation-policy";

const CONSENTED = {
  terms_accepted_at: "2026-10-01T00:00:00+00:00",
  terms_version: V,
  privacy_accepted_at: "2026-10-01T00:00:00+00:00",
  privacy_version: V,
};
function snap(over: Record<string, unknown>) {
  return { data: { found: true, status: "verified_user", deleted_at: null, role: null, admin_role: null, ...CONSENTED, ...over }, error: null };
}
const write = () => new NextRequest("http://localhost/api/community/posts", { method: "POST" });

describe("2-A 회원 쓰기 검사 1회 조회", () => {
  beforeEach(() => {
    db.rpc = [];
    db.from = 0;
  });

  it("동의한 활성 회원: DB 함수 1회 · 테이블 직접 조회 0회 · 통과", async () => {
    db.result = snap({});
    expect(await enforceApiMemberMutationPolicy(write())).toBeNull();
    expect(db.rpc).toEqual([{ fn: "member_write_gate_snapshot", args: { p_user_id: "user-gate-1" } }]);
    expect(db.from).toBe(0);
  });

  it("매 요청 새로 읽는다 (캐시 없음 · P0-R3): 두 번 쓰면 두 번 조회, 그 사이 차단되면 즉시 거부", async () => {
    db.result = snap({});
    expect(await enforceApiMemberMutationPolicy(write())).toBeNull();
    db.result = snap({ status: "blocked" });
    const res = await enforceApiMemberMutationPolicy(write());
    expect(res?.status).toBe(403);
    expect((await res!.json()).code).toBe("account_blocked");
    expect(db.rpc).toHaveLength(2);
  });

  it("프로필 없음 · DB 오류 · 형식 오류 → 503 fail-closed", async () => {
    for (const result of [
      { data: { found: false }, error: null },
      { data: null, error: { message: "boom" } },
      { data: { nope: 1 }, error: null },
    ]) {
      db.result = result;
      const res = await enforceApiMemberMutationPolicy(write());
      expect(res?.status).toBe(503);
      expect((await res!.json()).code).toBe("account_state_unavailable");
    }
  });

  it("미동의 회원 → 403 signup_incomplete · 미동의라도 활성 관리자는 통과 (판정식 불변)", async () => {
    db.result = snap({ terms_version: "old" });
    const denied = await enforceApiMemberMutationPolicy(write());
    expect(denied?.status).toBe(403);
    expect((await denied!.json()).code).toBe("signup_incomplete");

    db.result = snap({ terms_version: "old", admin_role: "super_admin" });
    expect(await enforceApiMemberMutationPolicy(write())).toBeNull();
  });

  it("동의 예외 경로(프로필 수정)는 미동의여도 통과, 조회는 1회", async () => {
    db.result = snap({ terms_version: "old" });
    const req = new NextRequest("http://localhost/api/me/profile", { method: "PATCH" });
    expect(await enforceApiMemberMutationPolicy(req)).toBeNull();
    expect(db.rpc).toHaveLength(1);
  });
});
