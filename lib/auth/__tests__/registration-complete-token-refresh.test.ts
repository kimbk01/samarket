import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

/**
 * 재감사2 #1 — 「빠진 단계 → 완료」 전환에서 토큰 1회 갱신이 **실제로** 일어나는지(문자열 검사 아님).
 * 화면 컴포넌트가 아니라 모듈 상태라 가입 단계 화면(관문 컴포넌트가 없는 화면)에서도 동작해야 한다.
 */
const refresh = vi.fn(async (_sb: unknown, _source: string) => ({ data: { session: null, user: null }, error: null }));
vi.mock("@/lib/supabase/client", () => ({ getSupabaseClient: () => ({ auth: {} }) }));
vi.mock("@/lib/supabase/auth-refresh-telemetry", () => ({
  runBrowserAuthRefreshDeduped: (sb: unknown, source: string) => refresh(sb, source),
}));

import {
  forgetRegistrationHistory,
  invalidateRegistrationPending,
  peekRegistrationPendingKnowledge,
  resetRegistrationPendingForTests,
  setRegistrationPendingFromServer,
} from "@/lib/auth/registration-pending-state.client";
import {
  installRegistrationCompleteTokenRefresh,
  resetRegistrationCompleteTokenRefreshForTests,
} from "@/lib/auth/registration-complete-token-refresh.client";

describe("가입 완료 순간 토큰 1회 갱신", () => {
  beforeEach(() => {
    /** 설치는 브라우저에서만 — 테스트에서 window 를 둔다 */
    vi.stubGlobal("window", globalThis.window ?? {});
    resetRegistrationPendingForTests();
    resetRegistrationCompleteTokenRefreshForTests();
    refresh.mockClear();
    installRegistrationCompleteTokenRefresh();
  });
  afterEach(() => {
    resetRegistrationPendingForTests();
    vi.unstubAllGlobals();
  });

  it("전화 → (인증 뒤 무효화) → 주소 → (주소 저장 뒤 무효화) → 완료: 갱신 정확히 1회", () => {
    setRegistrationPendingFromServer("phone");
    invalidateRegistrationPending();
    setRegistrationPendingFromServer("address");
    invalidateRegistrationPending();
    expect(refresh).not.toHaveBeenCalled();
    setRegistrationPendingFromServer(null);
    expect(refresh).toHaveBeenCalledTimes(1);
    expect(refresh.mock.calls[0]?.[1]).toBe("registration_complete_claim");
    setRegistrationPendingFromServer(null);
    expect(refresh).toHaveBeenCalledTimes(1);
  });

  it("처음부터 완료인 회원은 갱신하지 않는다 (요청 증가 없음)", () => {
    setRegistrationPendingFromServer(null);
    invalidateRegistrationPending();
    setRegistrationPendingFromServer(null);
    expect(refresh).not.toHaveBeenCalled();
  });

  it("「terms」는 전환으로 보지 않는다 · 로그아웃(기억 지움) 뒤 다른 계정 완료는 갱신 안 함", () => {
    setRegistrationPendingFromServer("terms");
    setRegistrationPendingFromServer(null);
    expect(refresh).not.toHaveBeenCalled();
    setRegistrationPendingFromServer("phone");
    forgetRegistrationHistory();
    setRegistrationPendingFromServer(null);
    expect(refresh).not.toHaveBeenCalled();
  });
});

describe("사본 유효시간 (재감사2 #2)", () => {
  afterEach(() => resetRegistrationPendingForTests());
  it("빠진 단계는 15초, 완료는 10분", () => {
    const t0 = Date.now();
    setRegistrationPendingFromServer("phone");
    expect(peekRegistrationPendingKnowledge(t0 + 14_000)).toBe("phone");
    expect(peekRegistrationPendingKnowledge(t0 + 16_000)).toBe("unknown");
    setRegistrationPendingFromServer(null);
    expect(peekRegistrationPendingKnowledge(Date.now() + 5 * 60_000)).toBe("complete");
    expect(peekRegistrationPendingKnowledge(Date.now() + 11 * 60_000)).toBe("unknown");
  });
});
