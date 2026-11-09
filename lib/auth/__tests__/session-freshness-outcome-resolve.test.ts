// @vitest-environment jsdom
/**
 * P0-C 운영 배포 보류 최종 검증 (2026-11-09) — 복귀 조정자 세션 판정 시나리오.
 * 인증 만료 복귀·3초 초과 후 회복·인증 실패·네트워크 오류·단일 비행, 그리고 Amendment 7 fetch 관문(3초 후 그대로 진행)이
 * 조정자 판정과 동시에 돌아도 바뀌지 않음을 고정한다.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { stringToBase64URL } from "@supabase/ssr";

const getSession = vi.fn();
vi.mock("@/lib/supabase/client", () => ({ getSupabaseClient: () => ({ auth: { getSession } }) }));

import {
  resetSessionFreshnessFetchGateForTests,
  resetSessionFreshnessOutcomeForTests,
  resolveSessionFreshnessOutcome,
  wrapFetchWithSessionFreshness,
} from "@/lib/auth/session-freshness-fetch-gate.client";

const KEY = "sb-ckdosyydvgzqwpbwuhon-auth-token";
function setSessionCookie(expSec: number): void {
  const token = `${stringToBase64URL(JSON.stringify({ alg: "ES256" }))}.${stringToBase64URL(JSON.stringify({ sub: "u", exp: expSec }))}.s`;
  const v = `base64-${stringToBase64URL(JSON.stringify({ access_token: token, expires_at: expSec }))}`;
  document.cookie = `${KEY}=${v}; path=/`;
}
function clearCookie(): void {
  document.cookie = `${KEY}=; expires=Thu, 01 Jan 1970 00:00:00 GMT; path=/`;
}
const nowSec = () => Math.floor(Date.now() / 1000);

beforeEach(() => {
  vi.stubEnv("NEXT_PUBLIC_SUPABASE_URL", "https://ckdosyydvgzqwpbwuhon.supabase.co");
  resetSessionFreshnessFetchGateForTests();
  resetSessionFreshnessOutcomeForTests();
  getSession.mockReset();
  clearCookie();
});
afterEach(() => {
  vi.useRealTimers();
  vi.unstubAllEnvs();
});

describe("resolveSessionFreshnessOutcome", () => {
  it("로그인 쿠키 없음 → guest, 세션 조회 0", async () => {
    expect(await resolveSessionFreshnessOutcome()).toBe("guest");
    expect(getSession).not.toHaveBeenCalled();
  });

  it("토큰 충분 → fresh, 대기·조회 0", async () => {
    setSessionCookie(nowSec() + 3600);
    expect(await resolveSessionFreshnessOutcome()).toBe("fresh");
    expect(getSession).not.toHaveBeenCalled();
  });

  it("만료된 채 복귀 → SDK 갱신 완료 시 refreshed", async () => {
    setSessionCookie(nowSec() - 60);
    getSession.mockResolvedValue({ data: { session: { expires_at: nowSec() + 3600 } }, error: null });
    expect(await resolveSessionFreshnessOutcome()).toBe("refreshed");
    expect(getSession).toHaveBeenCalledTimes(1);
  });

  it("갱신 3초 초과 → pending(무한 대기 없음), 이후 같은 조회가 끝나면 다음 판정은 refreshed", async () => {
    vi.useFakeTimers();
    setSessionCookie(nowSec() - 60);
    let release!: (v: unknown) => void;
    getSession.mockReturnValueOnce(new Promise((r) => (release = r)));
    const p = resolveSessionFreshnessOutcome(3000);
    await vi.advanceTimersByTimeAsync(3000);
    expect(await p).toBe("pending");
    release({ data: { session: { expires_at: nowSec() + 3600 } }, error: null });
    await vi.advanceTimersByTimeAsync(0);
    getSession.mockResolvedValueOnce({ data: { session: { expires_at: nowSec() + 3600 } }, error: null });
    expect(await resolveSessionFreshnessOutcome(3000)).toBe("refreshed");
  });

  it("리프레시 토큰 무효 → invalid", async () => {
    setSessionCookie(nowSec() - 60);
    getSession.mockResolvedValue({ data: { session: null }, error: { code: "refresh_token_not_found" } });
    expect(await resolveSessionFreshnessOutcome()).toBe("invalid");
  });

  it("네트워크 오류(throw) → error, 예외 전파 없음", async () => {
    setSessionCookie(nowSec() - 60);
    getSession.mockRejectedValue(new TypeError("Failed to fetch"));
    expect(await resolveSessionFreshnessOutcome()).toBe("error");
  });

  it("동시 판정 여러 개 → 세션 조회 1회(단일 비행)", async () => {
    setSessionCookie(nowSec() - 60);
    getSession.mockResolvedValue({ data: { session: { expires_at: nowSec() + 3600 } }, error: null });
    const r = await Promise.all([1, 2, 3].map(() => resolveSessionFreshnessOutcome()));
    expect(r).toEqual(["refreshed", "refreshed", "refreshed"]);
    expect(getSession).toHaveBeenCalledTimes(1);
  });
});

describe("Amendment 7 fetch 관문 불변 — 조정자 판정과 동시 실행", () => {
  it("갱신이 걸려도 fetch 는 3초 후 그대로 나가고, 조정자는 pending — 서로 막지 않음", async () => {
    vi.useFakeTimers();
    setSessionCookie(nowSec() - 60);
    getSession.mockReturnValue(new Promise(() => {}));
    const base = vi.fn(async () => new Response("ok"));
    const gated = wrapFetchWithSessionFreshness(base as unknown as typeof fetch, 3000);
    const f = gated("/api/me/profile");
    const o = resolveSessionFreshnessOutcome(3000);
    await vi.advanceTimersByTimeAsync(2999);
    expect(base).not.toHaveBeenCalled();
    await vi.advanceTimersByTimeAsync(1);
    await f;
    expect(base).toHaveBeenCalledTimes(1);
    expect(await o).toBe("pending");
    // 별도 단일 비행이라 getSession 호출은 최대 2회 — SDK 잠금이 실제 갱신을 1회로 합친다.
    expect(getSession.mock.calls.length).toBeLessThanOrEqual(2);
  });

  it("통화 경로는 만료 임박이어도 대기 0(관문 제외 유지)", async () => {
    setSessionCookie(nowSec() - 60);
    getSession.mockReturnValue(new Promise(() => {}));
    const base = vi.fn(async () => new Response("ok"));
    const gated = wrapFetchWithSessionFreshness(base as unknown as typeof fetch, 3000);
    await gated("/api/community-messenger/calls/sessions/incoming");
    expect(base).toHaveBeenCalledTimes(1);
    expect(getSession).not.toHaveBeenCalled();
  });
});
