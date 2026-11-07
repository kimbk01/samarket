import { beforeEach, describe, expect, it, vi } from "vitest";
import { NextRequest, NextResponse } from "next/server";

/**
 * B-3 (후속 감사 2026-11-08 · Owner 「묶음 1 진행」) — 앱(Android·iOS) 로그인 응답이 로그인 처리가 쓴
 * 활성 세션 쿠키(`samarket_active_session_id`)를 최종 응답에 싣는지. 이전에는 임시 응답에만 쓰이고 버려졌다.
 */

vi.mock("@/lib/supabase/try-supabase-server", () => ({
  tryCreateSupabaseServiceClient: () => ({
    from: () => ({
      select: () => ({ eq: () => ({ maybeSingle: async () => ({ data: { provider: "kakao", enabled: true }, error: null }) }) }),
    }),
  }),
}));
vi.mock("@/lib/auth/auth-provider-store", () => ({ resolveAuthProviderLoginGate: async () => ({ allowed: true }) }));
const captured: { setAll?: (c: unknown[]) => void } = {};
vi.mock("@supabase/ssr", () => ({
  createServerClient: (_u: string, _a: string, opts: { cookies: { setAll: (c: unknown[]) => void } }) => {
    captured.setAll = opts.cookies.setAll;
    return {};
  },
}));
const exchangeImpl = vi.fn();
vi.mock("@/lib/auth/native/native-token-exchange.server", () => ({
  createNativeExchangeContext: (request: unknown, response: unknown, routeSb: unknown) => ({ request, response, routeSb }),
  exchangeNativeProviderToken: (...a: unknown[]) => exchangeImpl(...a),
}));
vi.mock("@/lib/auth/native/apple-siwa-token.server", () => ({ storeAppleSigninRefreshToken: async () => ({ ok: true }) }));

function req() {
  return new NextRequest("https://samarket.vercel.app/api/auth/native/exchange", {
    method: "POST",
    body: JSON.stringify({ provider: "kakao", accessToken: "t" }),
  });
}

describe("native exchange — active session cookie carry (B-3)", () => {
  beforeEach(() => {
    vi.stubEnv("NEXT_PUBLIC_SUPABASE_URL", "https://proj.supabase.co");
    vi.stubEnv("NEXT_PUBLIC_SUPABASE_ANON_KEY", "anon");
    exchangeImpl.mockReset();
  });

  it("success: Supabase session cookie AND samarket_active_session_id are on the 200 response", async () => {
    const { setActiveSessionCookie } = await import("@/lib/auth/active-session");
    exchangeImpl.mockImplementationOnce(async (_input: unknown, ctx: { response: NextResponse }) => {
      captured.setAll?.([{ name: "sb-proj-auth-token", value: "jwt", options: { path: "/" } }]);
      await setActiveSessionCookie(ctx.response, "sess-123", true);
      return {
        ok: true, provider: "kakao", sessionEstablished: true, userId: "u1", redirectTo: "/home",
        signupComplete: true, isNewUser: false, needsProfileCompletion: false, needsTermsAgreement: false,
      };
    });
    const { POST } = await import("@/app/api/auth/native/exchange/route");
    const res = await POST(req());
    expect(res.status).toBe(200);
    expect(res.cookies.get("sb-proj-auth-token")?.value).toBe("jwt");
    expect(res.cookies.get("samarket_active_session_id")?.value).toBe("sess-123");
  });

  it("failure (withdrawn): only deletions are carried — never a session cookie", async () => {
    const { clearActiveSessionCookie } = await import("@/lib/auth/active-session");
    exchangeImpl.mockImplementationOnce(async (_input: unknown, ctx: { response: NextResponse }) => {
      // 세션을 만든 뒤 탈퇴로 판정된 경우를 흉내 — 새 세션 쿠키 + 로그아웃 삭제 쿠키 + 활성 세션 쿠키 삭제
      captured.setAll?.([
        { name: "sb-proj-auth-token", value: "jwt-should-not-leak", options: { path: "/" } },
        { name: "sb-proj-auth-token.0", value: "", options: { path: "/", maxAge: 0 } },
      ]);
      await clearActiveSessionCookie(ctx.response, true);
      return { ok: false, errorCode: "account_withdrawn", message: "withdrawn", status: 403 };
    });
    const { POST } = await import("@/app/api/auth/native/exchange/route");
    const res = await POST(req());
    expect(res.status).toBe(403);
    expect(res.cookies.get("sb-proj-auth-token")).toBeUndefined();
    expect(res.cookies.get("sb-proj-auth-token.0")?.value).toBe("");
    const active = res.cookies.get("samarket_active_session_id");
    expect(active?.value ?? "").toBe("");
  });
});
