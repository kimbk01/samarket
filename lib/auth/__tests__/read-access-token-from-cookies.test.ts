/**
 * Phase 3-1 — Supabase 세션 쿠키에서 access token 읽기 (Auth HARD LOCK Amendment 2026-11-08 (6)).
 */
import { describe, expect, it } from "vitest";
import { createChunks, stringToBase64URL } from "@supabase/ssr";
import {
  isAccessTokenWithinRefreshMargin,
  readAccessTokenFromCookies,
  supabaseAuthCookieKeyFromUrl,
} from "@/lib/auth/read-access-token-from-cookies";

const URL_ = "https://ckdosyydvgzqwpbwuhon.supabase.co";
const KEY = "sb-ckdosyydvgzqwpbwuhon-auth-token";

function jwt(payload: Record<string, unknown>): string {
  return `${stringToBase64URL(JSON.stringify({ alg: "ES256", kid: "k1" }))}.${stringToBase64URL(JSON.stringify(payload))}.sig`;
}

function sessionCookieValue(session: Record<string, unknown>): string {
  return `base64-${stringToBase64URL(JSON.stringify(session))}`;
}

describe("readAccessTokenFromCookies", () => {
  it("기본 저장 키는 supabase-js 와 같다", () => {
    expect(supabaseAuthCookieKeyFromUrl(URL_)).toBe(KEY);
    expect(supabaseAuthCookieKeyFromUrl("not a url")).toBeNull();
  });

  it("base64- 단일 쿠키에서 토큰·만료를 읽는다", async () => {
    const at = jwt({ sub: "u1", exp: 1_800_000_000 });
    const out = await readAccessTokenFromCookies(
      [{ name: KEY, value: sessionCookieValue({ access_token: at, refresh_token: "r", expires_at: 1_800_000_000 }) }],
      URL_
    );
    expect(out).toEqual({ accessToken: at, expiresAtSec: 1_800_000_000 });
  });

  it("청크(.0 .1) 쿠키를 SDK 와 같은 방식으로 합친다", async () => {
    const at = jwt({ sub: "u1", exp: 1_800_000_000, pad: "x".repeat(5000) });
    const value = sessionCookieValue({ access_token: at, refresh_token: "r", expires_at: 1_800_000_000 });
    const chunks = createChunks(KEY, value);
    expect(chunks.length).toBeGreaterThan(1);
    const out = await readAccessTokenFromCookies(chunks.map((c) => ({ name: c.name, value: c.value })), URL_);
    expect(out?.accessToken).toBe(at);
  });

  it("expires_at 이 없으면 JWT exp 를 쓴다 · 구형 평문 JSON 도 읽는다", async () => {
    const at = jwt({ sub: "u1", exp: 1_799_999_999 });
    const out = await readAccessTokenFromCookies([{ name: KEY, value: JSON.stringify({ access_token: at }) }], URL_);
    expect(out?.expiresAtSec).toBe(1_799_999_999);
  });

  it("다른 프로젝트 쿠키가 섞이면 환경 프로젝트 것을 고르고, 모르면 고르지 않는다", async () => {
    const mine = jwt({ sub: "mine", exp: 1 });
    const other = jwt({ sub: "other", exp: 1 });
    const cookies = [
      { name: "sb-otherproj-auth-token", value: sessionCookieValue({ access_token: other }) },
      { name: KEY, value: sessionCookieValue({ access_token: mine }) },
    ];
    expect((await readAccessTokenFromCookies(cookies, URL_))?.accessToken).toBe(mine);
    expect(await readAccessTokenFromCookies(cookies, "https://unknownref.supabase.co")).toBeNull();
  });

  it("손상·없음 → null (호출자는 기존 경로로 폴백)", async () => {
    expect(await readAccessTokenFromCookies([], URL_)).toBeNull();
    expect(await readAccessTokenFromCookies([{ name: KEY, value: "base64-@@@" }], URL_)).toBeNull();
    expect(await readAccessTokenFromCookies([{ name: KEY, value: sessionCookieValue({ access_token: "notajwt" }) }], URL_)).toBeNull();
    expect(await readAccessTokenFromCookies([{ name: "sb-x-auth-token-code-verifier", value: "v" }], URL_)).toBeNull();
  });
});

describe("isAccessTokenWithinRefreshMargin (auth-js EXPIRY_MARGIN 90초와 동일)", () => {
  const now = 1_800_000_000_000;
  it("만료 90초 이내·만료됨·모름 → 갱신 대상", () => {
    expect(isAccessTokenWithinRefreshMargin(now / 1000 + 60, now)).toBe(true);
    expect(isAccessTokenWithinRefreshMargin(now / 1000 - 10, now)).toBe(true);
    expect(isAccessTokenWithinRefreshMargin(null, now)).toBe(true);
  });
  it("90초 넘게 남음 → 캐시 사용 가능", () => {
    expect(isAccessTokenWithinRefreshMargin(now / 1000 + 600, now)).toBe(false);
  });
});
