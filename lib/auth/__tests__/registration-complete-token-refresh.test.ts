import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

/**
 * 재감사3 #2 — 서버 판정 「완료」 + 토큰 클레임 「미완료」 → 토큰 1회 갱신 (실제 상태 변화로 확인, 문자열 검사 아님).
 * 기억에 기대지 않으므로 단계 화면에서 처음 시작하거나 앱 복귀(SIGNED_IN)가 있어도 동작해야 한다.
 */
const refreshOk = { data: { session: { access_token: "new" }, user: null }, error: null };
const refresh = vi.fn(async (_sb: unknown, _source: string) => refreshOk as unknown);
let currentToken: string | null = null;
vi.mock("@/lib/supabase/client", () => ({
  getSupabaseClient: () => ({
    auth: { getSession: async () => ({ data: { session: currentToken ? { access_token: currentToken } : null } }) },
  }),
}));
vi.mock("@/lib/supabase/auth-refresh-telemetry", () => ({
  runBrowserAuthRefreshDeduped: (sb: unknown, source: string) => refresh(sb, source),
}));

import {
  invalidateRegistrationPending,
  resetRegistrationPendingForTests,
  setRegistrationPendingFromServer,
  subscribeRegistrationPending,
} from "@/lib/auth/registration-pending-state.client";
import {
  installRegistrationCompleteTokenRefresh,
  refreshTokenIfClaimStale,
  resetRegistrationCompleteTokenRefreshForTests,
  tokenClaimShowsRegistrationIncomplete,
} from "@/lib/auth/registration-complete-token-refresh.client";

function jwt(dibay_m: Record<string, unknown> | null, nonce = "a"): string {
  const enc = (o: unknown) => Buffer.from(JSON.stringify(o)).toString("base64url");
  return `${enc({ alg: "ES256" })}.${enc({ sub: "u1", n: nonce, ...(dibay_m ? { dibay_m } : {}) })}.sig`;
}
const base = { v: 1, reg: 1, phone_verified: true, provider: "kakao", has_phone: true, has_default_master: true, admin_role: null };

describe("토큰 클레임 판정 (proxy 와 같은 식)", () => {
  it("완료·주소 없음·번호 없는 수동 회원·관리자·재료 없음", () => {
    expect(tokenClaimShowsRegistrationIncomplete(jwt(base))).toBe(false);
    expect(tokenClaimShowsRegistrationIncomplete(jwt({ ...base, has_default_master: false }))).toBe(true);
    expect(tokenClaimShowsRegistrationIncomplete(jwt({ ...base, provider: "admin_manual", has_phone: false }))).toBe(true);
    expect(tokenClaimShowsRegistrationIncomplete(jwt({ ...base, has_default_master: false, admin_role: "admin" }))).toBe(false);
    expect(tokenClaimShowsRegistrationIncomplete(jwt({ v: 1 }))).toBe(false);
    expect(tokenClaimShowsRegistrationIncomplete("not-a-jwt")).toBe(false);
  });
});

describe("완료 순간 토큰 1회 갱신", () => {
  beforeEach(() => {
    vi.stubGlobal("window", globalThis.window ?? {});
    resetRegistrationPendingForTests();
    resetRegistrationCompleteTokenRefreshForTests();
    refresh.mockClear();
  });
  afterEach(() => {
    resetRegistrationPendingForTests();
    vi.unstubAllGlobals();
  });

  it("단계 화면에서 처음 시작(이전 기억 없음): 서버 완료 + 클레임 미완료 → 갱신 1회, 같은 토큰은 다시 안 함", async () => {
    currentToken = jwt({ ...base, has_default_master: false });
    setRegistrationPendingFromServer(null);
    expect(await refreshTokenIfClaimStale()).toBe(true);
    expect(refresh).toHaveBeenCalledTimes(1);
    expect(refresh.mock.calls[0]?.[1]).toBe("registration_complete_claim");
    expect(await refreshTokenIfClaimStale()).toBe(false);
    expect(refresh).toHaveBeenCalledTimes(1);
  });

  it("클레임이 이미 완료면 갱신 안 함 (가입 완료 회원 요청 증가 없음)", async () => {
    currentToken = jwt(base);
    setRegistrationPendingFromServer(null);
    expect(await refreshTokenIfClaimStale()).toBe(false);
    expect(refresh).not.toHaveBeenCalled();
  });

  it("서버가 아직 빠진 단계·모름이면 갱신 안 함", async () => {
    currentToken = jwt({ ...base, has_default_master: false });
    setRegistrationPendingFromServer("address");
    expect(await refreshTokenIfClaimStale()).toBe(false);
    invalidateRegistrationPending();
    expect(await refreshTokenIfClaimStale()).toBe(false);
    setRegistrationPendingFromServer("terms");
    expect(await refreshTokenIfClaimStale()).toBe(false);
    expect(refresh).not.toHaveBeenCalled();
  });

  it("설치 뒤 서버 값이 들어오면 자동으로 갱신 (구독 경로)", async () => {
    currentToken = jwt({ ...base, has_default_master: false }, "b");
    installRegistrationCompleteTokenRefresh();
    setRegistrationPendingFromServer(null);
    await vi.waitFor(() => expect(refresh).toHaveBeenCalledTimes(1));
  });
});

describe("사본 알림·유효시간 (재감사3 #1 · 재감사2 #2)", () => {
  afterEach(() => resetRegistrationPendingForTests());
  it("오래된 같은 값이 다시 와도 알린다 — 사장님 화면 재판정", () => {
    vi.useFakeTimers();
    try {
      let n = 0;
      subscribeRegistrationPending(() => {
        n += 1;
      });
      setRegistrationPendingFromServer("address");
      expect(n).toBe(1);
      setRegistrationPendingFromServer("address");
      expect(n).toBe(1);
      vi.advanceTimersByTime(16_000);
      setRegistrationPendingFromServer("address");
      expect(n).toBe(2);
    } finally {
      vi.useRealTimers();
    }
  });
});

describe("사본 유효시간 — 빠진 단계 15초, 완료 10분 (재감사2 #2)", () => {
  afterEach(() => resetRegistrationPendingForTests());
  it("경계값", async () => {
    const { peekRegistrationPendingKnowledge } = await import("@/lib/auth/registration-pending-state.client");
    const t0 = Date.now();
    setRegistrationPendingFromServer("phone");
    expect(peekRegistrationPendingKnowledge(t0 + 14_000)).toBe("phone");
    expect(peekRegistrationPendingKnowledge(t0 + 16_000)).toBe("unknown");
    setRegistrationPendingFromServer(null);
    expect(peekRegistrationPendingKnowledge(Date.now() + 5 * 60_000)).toBe("complete");
    expect(peekRegistrationPendingKnowledge(Date.now() + 11 * 60_000)).toBe("unknown");
  });
});


describe("갱신 실패 시 같은 토큰 재시도 — 토큰당 최대 2회 (전체 감사 A9)", () => {
  beforeEach(() => {
    vi.stubGlobal("window", globalThis.window ?? {});
    resetRegistrationPendingForTests();
    resetRegistrationCompleteTokenRefreshForTests();
    refresh.mockReset();
  });
  afterEach(() => {
    resetRegistrationPendingForTests();
    vi.unstubAllGlobals();
  });
  it("실패 → 다시 시도 → 2회 실패 뒤 멈춤 · 성공하면 그 토큰은 다시 안 함", async () => {
    currentToken = jwt({ ...base, has_default_master: false }, "fail");
    setRegistrationPendingFromServer(null);
    refresh.mockResolvedValue({ data: { session: null, user: null }, error: { message: "x" } });
    expect(await refreshTokenIfClaimStale()).toBe(false);
    expect(await refreshTokenIfClaimStale()).toBe(false);
    expect(await refreshTokenIfClaimStale()).toBe(false);
    expect(refresh).toHaveBeenCalledTimes(2);
    currentToken = jwt({ ...base, has_default_master: false }, "ok");
    refresh.mockResolvedValue(refreshOk);
    expect(await refreshTokenIfClaimStale()).toBe(true);
    expect(await refreshTokenIfClaimStale()).toBe(false);
    expect(refresh).toHaveBeenCalledTimes(3);
  });
});
