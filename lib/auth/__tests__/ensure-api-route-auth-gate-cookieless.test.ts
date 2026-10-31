/**
 * API 공통 인증 게이트 — 쿠키 없는 요청은 사용자별 세션 번호로 검증한다 (공용 "∅" 금지).
 */
import { describe, expect, it, vi } from "vitest";

const calls = vi.hoisted(() => ({ validated: [] as [string, string][] }));
vi.mock("next/headers", () => ({
  cookies: async () => ({ getAll: () => [{ name: "sb-proj-auth-token", value: "tok" }], get: () => undefined }),
  headers: async () => ({ get: () => "" }),
}));
vi.mock("@/lib/auth/api-route-auth-warm-cache", () => ({
  peekApiRouteAuthWarmCache: () => null,
  setApiRouteAuthWarmCache: () => {},
  runApiRouteAuthResolveSingleFlight: async (_k: string, fn: () => Promise<unknown>) => fn(),
}));
vi.mock("@/lib/supabase/supabase-server-route", () => ({ createSupabaseRouteHandlerClient: async () => ({}) }));
vi.mock("@/lib/auth/resolve-route-handler-user-id", () => ({
  resolveRouteHandlerAuthFromSupabase: async () => ({ userId: "user-a", claimsOnly: true, user: null }),
}));
vi.mock("@/lib/auth/auth-session-validate-cache", () => ({ peekAuthSessionValidateCached: () => false }));
vi.mock("@/lib/auth/auth-session-validate-dedupe", () => ({
  validateActiveSessionLightDeduped: async (userId: string, fp: string) => {
    calls.validated.push([userId, fp]);
    return { ok: true, inFlightHit: false, ttlCacheHit: false };
  },
}));

import { ensureApiRouteAuthGate } from "@/lib/auth/ensure-api-route-auth-gate";

describe("ensureApiRouteAuthGate — 쿠키 없는 세션", () => {
  it("활성 세션 쿠키가 없으면 cookieless:<userId> 로 검증", async () => {
    const r = await ensureApiRouteAuthGate();
    expect(r.ok).toBe(true);
    expect(calls.validated).toEqual([["user-a", "cookieless:user-a"]]);
  });
});
