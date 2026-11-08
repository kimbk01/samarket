// @vitest-environment jsdom
/**
 * Phase 3-2a — `/api` 세션 신선도 관문 (Auth HARD LOCK Amendment 2026-11-08 (7)).
 */
import { readFileSync } from "node:fs";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { stringToBase64URL } from "@supabase/ssr";

const getSession = vi.fn();
vi.mock("@/lib/supabase/client", () => ({ getSupabaseClient: () => ({ auth: { getSession } }) }));

import {
  isSessionFreshnessGatedApiPath,
  resetSessionFreshnessFetchGateForTests,
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

let base: ReturnType<typeof vi.fn>;

beforeEach(() => {
  vi.stubEnv("NEXT_PUBLIC_SUPABASE_URL", "https://ckdosyydvgzqwpbwuhon.supabase.co");
  resetSessionFreshnessFetchGateForTests();
  getSession.mockReset();
  base = vi.fn(async () => new Response("ok"));
  clearCookie();
});

afterEach(() => {
  vi.useRealTimers();
  vi.unstubAllEnvs();
});

describe("관문 대상 경로", () => {
  it("일반 /api 만 대상 — 인증·계측·버전·통화 경로는 제외", () => {
    expect(isSessionFreshnessGatedApiPath("/api/me/profile")).toBe(true);
    expect(isSessionFreshnessGatedApiPath("/api/community-messenger/home-sync")).toBe(true);
    for (const p of [
      "/api/auth/session",
      "/api/telemetry/entry",
      "/api/app/web-version",
      "/api/community-messenger/calls/sessions/incoming",
      "/api/community-messenger/rooms/x/calls",
      "/api/app/messenger-call-sound-config",
      "/api/me/notifications/missed-call-read",
      "/philife",
    ]) {
      expect(isSessionFreshnessGatedApiPath(p)).toBe(false);
    }
  });
});

describe("대기 규칙", () => {
  it("토큰이 충분히 남았으면 대기 0 (SDK 호출 없음)", async () => {
    setSessionCookie(nowSec() + 3600);
    const f = wrapFetchWithSessionFreshness(base);
    await f("/api/me/profile");
    expect(getSession).not.toHaveBeenCalled();
    expect(base).toHaveBeenCalledTimes(1);
  });

  it("로그인 쿠키가 없으면 대기 0", async () => {
    const f = wrapFetchWithSessionFreshness(base);
    await f("/api/me/profile");
    expect(getSession).not.toHaveBeenCalled();
  });

  it("만료(복귀 직후) → SDK 갱신 완료를 기다린 뒤 보낸다 · 동시 요청은 갱신 1회 공유", async () => {
    setSessionCookie(nowSec() - 600);
    let release!: () => void;
    getSession.mockImplementation(() => new Promise((r) => (release = () => r({ data: { session: {} } }))));
    const f = wrapFetchWithSessionFreshness(base);
    const a = f("/api/me/profile");
    const b = f("/api/me/notifications/badge-count");
    const c = f(new URL("/api/me/settings", window.location.href));
    await new Promise((r) => setTimeout(r, 0));
    expect(base).not.toHaveBeenCalled();
    expect(getSession).toHaveBeenCalledTimes(1);
    release();
    await Promise.all([a, b, c]);
    expect(base).toHaveBeenCalledTimes(3);
  });

  it("만료 90초 이내도 기다린다", async () => {
    setSessionCookie(nowSec() + 30);
    getSession.mockResolvedValue({ data: { session: {} } });
    const f = wrapFetchWithSessionFreshness(base);
    await f("/api/me/profile");
    expect(getSession).toHaveBeenCalledTimes(1);
  });

  it("SDK 가 응답하지 않으면 상한(3초) 뒤 그대로 보낸다", async () => {
    vi.useFakeTimers();
    setSessionCookie(nowSec() - 600);
    getSession.mockImplementation(() => new Promise(() => undefined));
    const f = wrapFetchWithSessionFreshness(base, 3000);
    const p = f("/api/me/profile");
    await vi.advanceTimersByTimeAsync(2999);
    expect(base).not.toHaveBeenCalled();
    await vi.advanceTimersByTimeAsync(2);
    await p;
    expect(base).toHaveBeenCalledTimes(1);
  });

  it("SDK 오류여도 그대로 보낸다 (401 처리는 기존 그대로)", async () => {
    setSessionCookie(nowSec() - 600);
    getSession.mockRejectedValue(new Error("refresh_token_not_found"));
    const f = wrapFetchWithSessionFreshness(base);
    await f("/api/me/profile");
    expect(base).toHaveBeenCalledTimes(1);
  });

  it("만료여도 제외 경로·다른 출처(Supabase)는 기다리지 않는다 — 잠금 교착 방지", async () => {
    setSessionCookie(nowSec() - 600);
    const f = wrapFetchWithSessionFreshness(base);
    await f("/api/auth/session");
    await f("/api/community-messenger/calls/sessions/incoming");
    await f("https://ckdosyydvgzqwpbwuhon.supabase.co/auth/v1/token?grant_type=refresh_token");
    expect(getSession).not.toHaveBeenCalled();
    expect(base).toHaveBeenCalledTimes(3);
  });
});

describe("설치 · 계약 기록", () => {
  it("AppBootProvider 모듈 로드 시 1회 설치", () => {
    const src = readFileSync("components/app/AppBootProvider.tsx", "utf8");
    expect(src).toMatch(/\ninstallSessionFreshnessFetchGate\(\);\n/);
  });
  it("HARD LOCK Amendment (7) trigger 2 기록", () => {
    const doc = readFileSync("docs/auth-hard-lock.md", "utf8");
    expect(doc).toContain("## Amendment 2026-11-08 (7)");
  });
});
