/**
 * Phase 3-1 — `/api` 게이트는 세션을 갱신하지 않는다 (Auth HARD LOCK Amendment 2026-11-08 (6)).
 * 만료 토큰이어도 서명만 검증해 같은 사용자를 식별, 검증 실패 시 기존 경로로 폴백.
 */
import { readFileSync } from "node:fs";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";

const URL_ = "https://ckdosyydvgzqwpbwuhon.supabase.co";
const KEY = "sb-ckdosyydvgzqwpbwuhon-auth-token";

async function cookieFor(sub: string, expSec: number): Promise<{ header: string; token: string }> {
  const { stringToBase64URL } = await vi.importActual<typeof import("@supabase/ssr")>("@supabase/ssr");
  const token = `${stringToBase64URL(JSON.stringify({ alg: "ES256", kid: "k1" }))}.${stringToBase64URL(
    JSON.stringify({ sub, exp: expSec })
  )}.sig`;
  const value = `base64-${stringToBase64URL(JSON.stringify({ access_token: token, refresh_token: "r", expires_at: expSec }))}`;
  return { header: `${KEY}=${value}`, token };
}

function req(cookie: string): NextRequest {
  return new NextRequest("http://localhost/api/community/posts", { method: "POST", headers: { cookie } });
}

let getClaims: ReturnType<typeof vi.fn>;
let getSession: ReturnType<typeof vi.fn>;
let fallback: ReturnType<typeof vi.fn>;

function mockDeps() {
  vi.doMock("@/lib/auth/proxy-auth-session-cache", () => ({
    peekProxyAuthSessionCache: () => null,
    proxyAuthCookieFingerprint: () => "fp",
    setProxyAuthSessionCache: () => {},
  }));
  vi.doMock("@/lib/env/runtime", () => ({
    requireSupabaseEnv: () => ({ ok: true, url: URL_, anonKey: "anon" }),
  }));
  vi.doMock("@supabase/ssr", async () => {
    const actual = await vi.importActual<typeof import("@supabase/ssr")>("@supabase/ssr");
    return { ...actual, createServerClient: () => ({ auth: { getClaims, getSession } }) };
  });
  vi.doMock("@/lib/auth/resolve-proxy-auth-from-supabase", () => ({ resolveProxyAuthFromSupabase: fallback }));
}

beforeEach(() => {
  vi.resetModules();
  getClaims = vi.fn();
  getSession = vi.fn();
  fallback = vi.fn(async () => ({ userId: "fallback-user", transientError: false, terminalAuthFailure: false }));
  mockDeps();
});

describe("resolveApiIdentity — 갱신 없는 서명 검증", () => {
  it("만료된 토큰: getClaims(token, allowExpired) 로 같은 사용자 · 세션 로드·기존 갱신 경로 0", async () => {
    const { header, token } = await cookieFor("user-1", Math.floor(Date.now() / 1000) - 3600);
    getClaims.mockResolvedValue({ data: { claims: { sub: "user-1" } }, error: null });
    const { resolveApiIdentity } = await import("@/lib/auth/enforce-api-member-mutation-policy");
    const out = await resolveApiIdentity(req(header));
    expect(out).toEqual({ userId: "user-1", transientError: false });
    expect(getClaims).toHaveBeenCalledWith(token, { allowExpired: true });
    expect(getSession).not.toHaveBeenCalled();
    expect(fallback).not.toHaveBeenCalled();
  });

  it("서명 검증 실패 → 기존 경로로 폴백 (동작 불변)", async () => {
    const { header } = await cookieFor("user-1", Math.floor(Date.now() / 1000) + 3600);
    getClaims.mockResolvedValue({ data: null, error: new Error("invalid signature") });
    const { resolveApiIdentity } = await import("@/lib/auth/enforce-api-member-mutation-policy");
    const out = await resolveApiIdentity(req(header));
    expect(out.userId).toBe("fallback-user");
    expect(fallback).toHaveBeenCalledTimes(1);
  });

  it("쿠키를 읽을 수 없으면 기존 경로 그대로", async () => {
    const { resolveApiIdentity } = await import("@/lib/auth/enforce-api-member-mutation-policy");
    const out = await resolveApiIdentity(req(`${KEY}=garbage`));
    expect(out.userId).toBe("fallback-user");
    expect(getClaims).not.toHaveBeenCalled();
  });
});

describe("proxy 화면 문서 — 만료 임박이면 캐시를 쓰지 않는다 (소스 계약)", () => {
  it("캐시 적중 뒤 만료 90초 이내 판정으로 userId 를 비워 갱신 경로로 보낸다", () => {
    const src = readFileSync("proxy.ts", "utf8");
    const at = src.indexOf("let userId = peekProxyAuthSessionCache(authFp);");
    expect(at).toBeGreaterThan(0);
    const after = src.slice(at, at + 900);
    expect(after).toContain("isAccessTokenWithinRefreshMargin(cookieToken.expiresAtSec)");
    expect(after).toContain("userId = null;");
  });
});

describe("HARD LOCK 기록", () => {
  it("Amendment 2026-11-08 (6) 이 trigger 2 로 기록돼 있다", () => {
    const doc = readFileSync("docs/auth-hard-lock.md", "utf8");
    expect(doc).toContain("## Amendment 2026-11-08 (6)");
    expect(doc).toContain("Reopen §4 trigger 2");
  });
});
