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
    expect(body).toEqual({
      ok: true,
      already_logged_out: true,
      device_unbind_warning: null,
    });
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

  it("로그아웃한 세션 id 를 프로필 「현재 세션」에서도 지운다 (같은 id 일 때만) — 재로그인 401 방지", async () => {
    getUser.mockResolvedValue({ data: { user: { id: "u1" } }, error: null });
    requireAuth.mockResolvedValue({ ok: true, userId: "u1" });
    readActiveSessionIdCookie.mockResolvedValue("sess-1");
    invalidateUserSessionRegistry.mockResolvedValue(undefined);
    const calls: { table: string; ops: [string, unknown[]][] }[] = [];
    tryCreateSupabaseServiceClient.mockReturnValue({
      from: (table: string) => {
        const rec = { table, ops: [] as [string, unknown[]][] };
        calls.push(rec);
        const b: Record<string, unknown> = {};
        for (const op of ["select", "update", "eq", "in", "neq", "is", "not", "limit", "maybeSingle"]) {
          b[op] = (...args: unknown[]) => {
            rec.ops.push([op, args]);
            return b;
          };
        }
        b.then = (resolve: (r: unknown) => unknown) => resolve({ data: [], error: null });
        return b;
      },
    });

    const { POST } = await import("@/app/api/auth/logout/route");
    const request = new NextRequest("https://samarket.vercel.app/api/auth/logout", {
      method: "POST",
      headers: { cookie: "sb-proj-auth-token=abc" },
    });
    const res = await POST(request);
    expect(res.status).toBe(200);
    expect(invalidateUserSessionRegistry).toHaveBeenCalledWith(expect.anything(), "u1", "sess-1", "user_logout");
    const profileUpdate = calls.find(
      (c) => c.table === "profiles" && c.ops.some(([op]) => op === "update")
    );
    expect(profileUpdate?.ops).toEqual([
      ["update", [{ active_session_id: null }]],
      ["eq", ["id", "u1"]],
      ["eq", ["active_session_id", "sess-1"]],
    ]);
  });
});
