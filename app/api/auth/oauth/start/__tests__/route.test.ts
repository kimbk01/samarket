import { beforeEach, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";

const signInWithOAuth = vi.fn();

let serviceClient: unknown = null;
vi.mock("@/lib/supabase/try-supabase-server", () => ({
  tryCreateSupabaseServiceClient: () => serviceClient,
}));

function providerRowClient(row: Record<string, unknown> | null, error: { message: string } | null = null) {
  return {
    from: () => ({
      select: () => ({
        eq: () => ({ maybeSingle: async () => ({ data: row, error }) }),
      }),
    }),
  };
}

vi.mock("@supabase/ssr", () => ({
  createServerClient: vi.fn((_url, _anon, options) => {
    options.cookies.setAll([
      {
        name: "sb-pkce",
        value: "verifier",
        options: { path: "/", maxAge: 600, sameSite: "lax", secure: true, httpOnly: true },
      },
    ]);
    return { auth: { signInWithOAuth } };
  }),
}));

describe("/api/auth/oauth/start", () => {
  beforeEach(() => {
    vi.stubEnv("NEXT_PUBLIC_SUPABASE_URL", "https://proj.supabase.co");
    vi.stubEnv("NEXT_PUBLIC_SUPABASE_ANON_KEY", "anon");
    signInWithOAuth.mockReset();
    serviceClient = null;
  });

  it("returns JSON authorizeUrl for native launch=native fetch", async () => {
    signInWithOAuth.mockResolvedValue({
      data: { url: "https://proj.supabase.co/auth/v1/authorize?provider=google" },
      error: null,
    });
    const { GET } = await import("@/app/api/auth/oauth/start/route");

    const res = await GET(
      new NextRequest("https://samarket.vercel.app/api/auth/oauth/start?provider=google&launch=native&dibay_app=android&next=%2Fmarket"),
    );
    const body = await res.json();

    expect(res.status).toBe(200);
    expect(body).toEqual({
      ok: true,
      authorizeUrl: "https://proj.supabase.co/auth/v1/authorize?provider=google",
      provider: "google",
      redirectTo: "https://samarket.vercel.app/auth/oauth/capacitor-return?provider=google&next=%2Fmarket",
    });
    expect(res.headers.get("cache-control")).toBe("no-store");
    expect(res.cookies.get("dibay_app")?.value).toBe("android");
  });

  it("returns JSON with dibay redirect for launch=native without dibay_app marker", async () => {
    signInWithOAuth.mockResolvedValue({
      data: { url: "https://proj.supabase.co/auth/v1/authorize?provider=google" },
      error: null,
    });
    const { GET } = await import("@/app/api/auth/oauth/start/route");

    const res = await GET(
      new NextRequest("https://samarket.vercel.app/api/auth/oauth/start?provider=google&launch=native&next=%2Fmypage"),
    );
    const body = await res.json();

    expect(res.status).toBe(200);
    expect(body.redirectTo).toBe(
      "https://samarket.vercel.app/auth/oauth/capacitor-return?provider=google&next=%2Fmypage",
    );
    expect(signInWithOAuth).toHaveBeenCalledWith({
      provider: "google",
      options: {
        redirectTo: "https://samarket.vercel.app/auth/oauth/capacitor-return?provider=google&next=%2Fmypage",
        skipBrowserRedirect: true,
        queryParams: { prompt: "select_account" },
      },
    });
  });

  it("blocks native WebView 302 without launch=native", async () => {
    signInWithOAuth.mockResolvedValue({
      data: { url: "https://proj.supabase.co/auth/v1/authorize?provider=google" },
      error: null,
    });
    const { GET } = await import("@/app/api/auth/oauth/start/route");

    const res = await GET(
      new NextRequest("https://samarket.vercel.app/api/auth/oauth/start?provider=google&dibay_app=android"),
    );
    const body = await res.json();

    expect(res.status).toBe(400);
    expect(body.errorCode).toBe("native_launch_requires_json");
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
    expect(signInWithOAuth).toHaveBeenCalledWith({
      provider: "apple",
      options: {
        redirectTo: "https://samarket.vercel.app/auth/callback?provider=apple",
        skipBrowserRedirect: true,
      },
    });
  });

  it("adds Kakao scope and prompt=login for native JSON launch", async () => {
    signInWithOAuth.mockResolvedValue({
      data: { url: "https://proj.supabase.co/auth/v1/authorize?provider=kakao" },
      error: null,
    });
    const { GET } = await import("@/app/api/auth/oauth/start/route");

    await GET(
      new NextRequest("https://samarket.vercel.app/api/auth/oauth/start?provider=kakao&launch=native&dibay_app=android"),
    );

    expect(signInWithOAuth).toHaveBeenCalledWith({
      provider: "kakao",
      options: {
        redirectTo: "https://samarket.vercel.app/auth/oauth/capacitor-return?provider=kakao",
        skipBrowserRedirect: true,
        queryParams: {
          scope: "profile_nickname profile_image",
          prompt: "login",
        },
      },
    });
  });

  it("OA-14: rejects provider disabled in auth_providers with 403 provider_disabled", async () => {
    serviceClient = providerRowClient({ provider: "kakao", enabled: false });
    const { GET } = await import("@/app/api/auth/oauth/start/route");
    const res = await GET(
      new NextRequest("https://samarket.vercel.app/api/auth/oauth/start?provider=kakao"),
    );
    expect(res.status).toBe(403);
    expect((await res.json()).errorCode).toBe("provider_disabled");
    expect(signInWithOAuth).not.toHaveBeenCalled();
  });

  it("OA-14: fails open for google when auth_providers read fails", async () => {
    serviceClient = providerRowClient(null, { message: "boom" });
    signInWithOAuth.mockResolvedValue({
      data: { url: "https://proj.supabase.co/auth/v1/authorize?provider=google" },
      error: null,
    });
    const { GET } = await import("@/app/api/auth/oauth/start/route");
    const res = await GET(
      new NextRequest("https://samarket.vercel.app/api/auth/oauth/start?provider=google"),
    );
    expect(res.status).toBe(307);
  });

  it("OA-15: preserves PKCE cookie options on redirect", async () => {
    signInWithOAuth.mockResolvedValue({
      data: { url: "https://proj.supabase.co/auth/v1/authorize?provider=google" },
      error: null,
    });
    const { GET } = await import("@/app/api/auth/oauth/start/route");
    const res = await GET(
      new NextRequest("https://samarket.vercel.app/api/auth/oauth/start?provider=google"),
    );
    const cookie = res.cookies.get("sb-pkce");
    expect(cookie?.value).toBe("verifier");
    expect(cookie?.maxAge).toBe(600);
    expect(cookie?.httpOnly).toBe(true);
    expect(cookie?.secure).toBe(true);
    expect(cookie?.sameSite).toBe("lax");
    expect(cookie?.path).toBe("/");
  });
});
