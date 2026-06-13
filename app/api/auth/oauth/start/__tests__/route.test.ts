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
      redirectTo: "dibay://auth/callback?provider=google&next=%2Fmarket",
    });
    expect(res.headers.get("cache-control")).toBe("no-store");
    expect(res.cookies.get("dibay_app")?.value).toBe("android");
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

  it("adds Kakao scope for native JSON launch", async () => {
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
        redirectTo: "dibay://auth/callback?provider=kakao",
        skipBrowserRedirect: true,
        queryParams: { scope: "profile_nickname profile_image" },
      },
    });
  });
});
