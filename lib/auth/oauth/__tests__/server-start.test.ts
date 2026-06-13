import { describe, expect, it, vi } from "vitest";
import { NextRequest, NextResponse } from "next/server";
import {
  buildOAuthStartJsonResponse,
  buildOAuthStartLoginRedirect,
  buildOAuthStartRedirectResponse,
  createSupabaseOAuthAuthorizeUrl,
} from "@/lib/auth/oauth/server-start";

const signInWithOAuth = vi.fn();

vi.mock("@supabase/ssr", () => ({
  createServerClient: vi.fn(() => ({
    auth: { signInWithOAuth },
  })),
}));

describe("oauth server-start", () => {
  it("buildOAuthStartJsonResponse returns authorizeUrl and preserves cookies", () => {
    const carrier = NextResponse.json({ ok: true });
    carrier.cookies.set("pkce", "abc", { path: "/" });
    const res = buildOAuthStartJsonResponse("https://example.com/auth", carrier);
    expect(res.status).toBe(200);
    return res.json().then((body) => {
      expect(body).toEqual({ ok: true, authorizeUrl: "https://example.com/auth" });
      expect(res.cookies.get("pkce")?.value).toBe("abc");
    });
  });

  it("buildOAuthStartRedirectResponse redirects with cookies", () => {
    const carrier = NextResponse.json({ ok: true });
    carrier.cookies.set("pkce", "xyz", { path: "/" });
    const res = buildOAuthStartRedirectResponse("https://example.com/auth", carrier);
    expect(res.status).toBe(307);
    expect(res.headers.get("location")).toBe("https://example.com/auth");
    expect(res.cookies.get("pkce")?.value).toBe("xyz");
  });

  it("buildOAuthStartLoginRedirect encodes auth_error", () => {
    const req = new NextRequest("https://samarket.vercel.app/api/auth/oauth/start?provider=google");
    const res = buildOAuthStartLoginRedirect(req, "oauth_redirect_mismatch", "scheme", "/market");
    expect(res.headers.get("location")).toBe(
      "https://samarket.vercel.app/login?next=%2Fmarket&auth_error=oauth_redirect_mismatch&auth_error_detail=scheme",
    );
  });

  it("createSupabaseOAuthAuthorizeUrl passes Kakao scope", async () => {
    vi.stubEnv("NEXT_PUBLIC_SUPABASE_URL", "https://proj.supabase.co");
    vi.stubEnv("NEXT_PUBLIC_SUPABASE_ANON_KEY", "anon-key");
    signInWithOAuth.mockResolvedValue({
      data: {
        url: "https://proj.supabase.co/auth/v1/authorize?redirect_to=dibay%3A%2F%2Fauth%2Fcallback%3Fprovider%3Dkakao",
      },
      error: null,
    });

    const req = new NextRequest("https://samarket.vercel.app/api/auth/oauth/start?provider=kakao&launch=native");
    const result = await createSupabaseOAuthAuthorizeUrl({
      req,
      provider: "kakao",
      next: null,
      isNative: true,
    });

    expect(result.ok).toBe(true);
    expect(signInWithOAuth).toHaveBeenCalledWith(
      expect.objectContaining({
        provider: "kakao",
        options: expect.objectContaining({
          queryParams: { scope: "profile_nickname profile_image" },
          redirectTo: "dibay://auth/callback?provider=kakao",
        }),
      }),
    );
  });

  it("createSupabaseOAuthAuthorizeUrl rejects redirect mismatch", async () => {
    vi.stubEnv("NEXT_PUBLIC_SUPABASE_URL", "https://proj.supabase.co");
    vi.stubEnv("NEXT_PUBLIC_SUPABASE_ANON_KEY", "anon-key");
    signInWithOAuth.mockResolvedValue({
      data: {
        url: "https://proj.supabase.co/auth/v1/authorize?redirect_to=https%3A%2F%2Fsamarket.vercel.app%2Fauth%2Fcallback",
      },
      error: null,
    });

    const req = new NextRequest("https://samarket.vercel.app/api/auth/oauth/start?provider=google&launch=native");
    const result = await createSupabaseOAuthAuthorizeUrl({
      req,
      provider: "google",
      next: null,
      isNative: true,
    });

    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.errorCode).toBe("oauth_redirect_mismatch");
    }
  });
});
