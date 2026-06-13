import { beforeEach, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";

const signOut = vi.fn();
const getUser = vi.fn();
const invalidateUserSessionRegistry = vi.fn();
const requireAuth = vi.fn();
const readActiveSessionIdCookie = vi.fn();
const clearActiveSessionCookie = vi.fn();
const tryCreateSupabaseServiceClient = vi.fn();

vi.mock("@/lib/auth/user-session-registry", () => ({
  invalidateUserSessionRegistry: (...args: unknown[]) => invalidateUserSessionRegistry(...args),
}));

vi.mock("@/lib/auth/server-guards", () => ({
  requireAuth: () => requireAuth(),
}));

vi.mock("@/lib/auth/active-session", () => ({
  readActiveSessionIdCookie: () => readActiveSessionIdCookie(),
  clearActiveSessionCookie: (...args: unknown[]) => clearActiveSessionCookie(...args),
}));

vi.mock("@/lib/supabase/try-supabase-server", () => ({
  tryCreateSupabaseServiceClient: () => tryCreateSupabaseServiceClient(),
}));

vi.mock("@supabase/ssr", () => ({
  createServerClient: vi.fn((_url, _anon, options) => {
    options.cookies.setAll([
      { name: "sb-proj-auth-token", value: "", options: { path: "/", maxAge: 0 } },
      { name: "sb-proj-auth-token-code-verifier", value: "", options: { path: "/", maxAge: 0 } },
    ]);
    return {
      auth: {
        getUser,
        signOut,
      },
    };
  }),
}));

describe("POST /api/auth/logout", () => {
  beforeEach(() => {
    vi.resetModules();
    vi.stubEnv("NEXT_PUBLIC_SUPABASE_URL", "https://proj.supabase.co");
    vi.stubEnv("NEXT_PUBLIC_SUPABASE_ANON_KEY", "anon");
    signOut.mockReset();
    signOut.mockResolvedValue({ error: null });
    getUser.mockReset();
    invalidateUserSessionRegistry.mockReset();
    requireAuth.mockReset();
    readActiveSessionIdCookie.mockReset();
    clearActiveSessionCookie.mockReset();
    tryCreateSupabaseServiceClient.mockReset();
    clearActiveSessionCookie.mockImplementation(async (response: { cookies: { set: (n: string, v: string) => void } }) => {
      response.cookies.set("samarket_active_session_id", "");
    });
    tryCreateSupabaseServiceClient.mockReturnValue({ from: vi.fn() });
  });

  it("calls local signOut and clears Supabase auth cookies even when already logged out", async () => {
    getUser.mockResolvedValue({ data: { user: null }, error: null });
    const { POST } = await import("@/app/api/auth/logout/route");

    const request = new NextRequest("https://samarket.vercel.app/api/auth/logout", {
      method: "POST",
      headers: { cookie: "sb-proj-auth-token=abc;sb-proj-auth-token-code-verifier=xyz" },
    });
    const res = await POST(request);
    const body = await res.json();

    expect(res.status).toBe(200);
    expect(body).toEqual({ ok: true, already_logged_out: true });
    expect(signOut).toHaveBeenCalledWith({ scope: "local" });
    expect(res.headers.get("cache-control")).toBe("no-store, no-cache, must-revalidate");
    expect(res.cookies.get("sb-proj-auth-token")?.value).toBe("");
    expect(res.cookies.get("sb-proj-auth-token-code-verifier")?.value).toBe("");
    expect(res.cookies.get("samarket_active_session_id")?.value).toBe("");
  });

  it("still clears cookies when registry invalidation fails", async () => {
    getUser.mockResolvedValue({ data: { user: { id: "u1" } }, error: null });
    requireAuth.mockResolvedValue({ ok: true, userId: "u1" });
    readActiveSessionIdCookie.mockResolvedValue("sess-1");
    invalidateUserSessionRegistry.mockRejectedValue(new Error("registry_fail"));

    const { POST } = await import("@/app/api/auth/logout/route");
    const request = new NextRequest("https://samarket.vercel.app/api/auth/logout", {
      method: "POST",
      headers: { cookie: "sb-proj-auth-token=abc" },
    });
    const res = await POST(request);
    const body = await res.json();

    expect(res.status).toBe(500);
    expect(body.ok).toBe(false);
    expect(signOut).toHaveBeenCalledWith({ scope: "local" });
    expect(res.cookies.get("sb-proj-auth-token")?.value).toBe("");
    expect(res.cookies.get("samarket_active_session_id")?.value).toBe("");
  });
});
