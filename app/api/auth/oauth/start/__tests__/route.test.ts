import { beforeEach, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";

const signInWithOAuth = vi.fn();

vi.mock("@supabase/ssr", () => ({
  createServerClient: vi.fn((_url, _anon, options) => {
    options.cookies.setAll([
      { name: "sb-pkce", value: "verifier", options: { path: "/" } },
    ]);
    return { auth: { signInWithOAuth } };
  }),
}));

describe("/api/auth/oauth/start", () => {
  beforeEach(() => {
    vi.stubEnv("NEXT_PUBLIC_SUPABASE_URL", "https://proj.supabase.co");
    vi.stubEnv("NEXT_PUBLIC_SUPABASE_ANON_KEY", "anon");
    signInWithOAuth.mockReset();
  });

  it("returns JSON authorizeUrl for native launch", async () => {
    signInWithOAuth.mockResolvedValue({
      data: { url: "https://proj.supabase.co/auth/v1/authorize?provider=google" },
      error: null,
    });
    const { GET } = await import("@/app/api/auth/oauth/start/route");

    const res = await GET(
      new NextRequest("https://samarket.vercel.app/api/auth/oauth/start?provider=google&launch=native&next=%2Fmarket"),
    );
    const body = await res.json();

    expect(res.status).toBe(200);
    expect(body).toEqual({
      ok: true,
      authorizeUrl: "https://proj.supabase.co/auth/v1/authorize?provider=google",
      provider: "google",
      redirectTo: "dibay://auth/callback?provider=google&next=%2Fmarket",
    });
    expect(res.headers.get("cache-control")).toBe("no-store");
    expect(signInWithOAuth).toHaveBeenCalledWith({
      provider: "google",
      options: {
        redirectTo: "dibay://auth/callback?provider=google&next=%2Fmarket",
        skipBrowserRedirect: true,
      },
    });
  });

  it("redirects to authorizeUrl for web launch", async () => {
    signInWithOAuth.mockResolvedValue({
      data: { url: "https://proj.supabase.co/auth/v1/authorize?provider=apple" },
      error: null,
    });
    const { GET } = await import("@/app/api/auth/oauth/start/route");

    const res = await GET(
      new NextRequest("https://samarket.vercel.app/api/auth/oauth/start?provider=apple"),
    );

    expect(res.status).toBe(307);
    expect(res.headers.get("location")).toBe(
      "https://proj.supabase.co/auth/v1/authorize?provider=apple",
    );
    expect(res.headers.get("cache-control")).toBe("no-store");
    expect(signInWithOAuth).toHaveBeenCalledWith({
      provider: "apple",
      options: {
        redirectTo: "https://samarket.vercel.app/auth/callback?provider=apple",
        skipBrowserRedirect: true,
      },
    });
  });

  it("adds Kakao scope without redirect mismatch blocking", async () => {
    signInWithOAuth.mockResolvedValue({
      data: { url: "https://proj.supabase.co/auth/v1/authorize?provider=kakao" },
      error: null,
    });
    const { GET } = await import("@/app/api/auth/oauth/start/route");

    await GET(
      new NextRequest("https://samarket.vercel.app/api/auth/oauth/start?provider=kakao&launch=native"),
    );

    expect(signInWithOAuth).toHaveBeenCalledWith({
      provider: "kakao",
      options: {
        redirectTo: "dibay://auth/callback?provider=kakao",
        skipBrowserRedirect: true,
        queryParams: { scope: "profile_nickname profile_image" },
      },
    });
  });

  it("rejects invalid provider with clear JSON error and no-store", async () => {
    const { GET } = await import("@/app/api/auth/oauth/start/route");

    const res = await GET(
      new NextRequest("https://samarket.vercel.app/api/auth/oauth/start?provider=facebook&launch=native"),
    );
    const body = await res.json();

    expect(res.status).toBe(400);
    expect(res.headers.get("cache-control")).toBe("no-store");
    expect(body).toEqual({
      ok: false,
      errorCode: "invalid_provider",
      message: "OAuth provider must be google, kakao, or apple.",
    });
  });
});
