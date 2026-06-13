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

  it("redirects with dibay callback for native app marker query", async () => {
    signInWithOAuth.mockResolvedValue({
      data: { url: "https://proj.supabase.co/auth/v1/authorize?provider=google" },
      error: null,
    });
    const { GET } = await import("@/app/api/auth/oauth/start/route");

    const res = await GET(
      new NextRequest("https://samarket.vercel.app/api/auth/oauth/start?provider=google&dibay_app=android&next=%2Fmarket"),
    );

    expect(res.status).toBe(307);
    expect(res.headers.get("location")).toBe(
      "https://proj.supabase.co/auth/v1/authorize?provider=google",
    );
    expect(res.headers.get("cache-control")).toBe("no-store");
    expect(signInWithOAuth).toHaveBeenCalledWith({
      provider: "google",
      options: {
        redirectTo: "dibay://auth/callback?provider=google&next=%2Fmarket",
        skipBrowserRedirect: true,
      },
    });
  });

  it("redirects with dibay callback when dibay_app cookie is present", async () => {
    signInWithOAuth.mockResolvedValue({
      data: { url: "https://proj.supabase.co/auth/v1/authorize?provider=apple" },
      error: null,
    });
    const { GET } = await import("@/app/api/auth/oauth/start/route");

    const req = new NextRequest("https://samarket.vercel.app/api/auth/oauth/start?provider=apple");
    req.cookies.set("dibay_app", "android");
    const res = await GET(req);

    expect(res.status).toBe(307);
    expect(signInWithOAuth).toHaveBeenCalledWith({
      provider: "apple",
      options: {
        redirectTo: "dibay://auth/callback?provider=apple",
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
      new NextRequest("https://samarket.vercel.app/api/auth/oauth/start?provider=kakao&dibay_app=android"),
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
      new NextRequest("https://samarket.vercel.app/api/auth/oauth/start?provider=facebook&dibay_app=android"),
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
