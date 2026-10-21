/**
 * P2-4 (SG-08, SV-05) — PRODUCT_WRITE 게이트: 세션 쿠키 + identity 일시 오류 → 503 fail-closed.
 * P2-6 (SV-04) — GET /api/*: blocked/withdrawn → 403 account_restricted (캐시 경로), suspended 허용.
 */
import { beforeEach, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";
import type { MemberLifecycleAuthorityResult } from "@/lib/auth/resolve-member-lifecycle-authority";

const SESSION_COOKIE = "sb-proj-auth-token=abc";

function req(path: string, method: string, cookie?: string): NextRequest {
  const headers = new Headers();
  if (cookie) headers.set("cookie", cookie);
  return new NextRequest(`http://localhost${path}`, { method, headers });
}

function mockIdentity(impl: () => Promise<{ userId: string | null; transientError: boolean; terminalAuthFailure: boolean }>) {
  vi.doMock("@/lib/auth/proxy-auth-session-cache", () => ({
    peekProxyAuthSessionCache: () => null,
    proxyAuthCookieFingerprint: () => "fp",
    setProxyAuthSessionCache: () => {},
  }));
  vi.doMock("@/lib/env/runtime", () => ({
    requireSupabaseEnv: () => ({ ok: true, url: "http://supabase.local", anonKey: "anon" }),
  }));
  vi.doMock("@supabase/ssr", () => ({ createServerClient: () => ({}) }));
  vi.doMock("@/lib/auth/resolve-proxy-auth-from-supabase", () => ({
    resolveProxyAuthFromSupabase: impl,
  }));
}

function mockLifecycle(result: MemberLifecycleAuthorityResult, spy = vi.fn()) {
  vi.doMock("@/lib/auth/resolve-member-lifecycle-authority", async () => {
    const actual = await vi.importActual<typeof import("@/lib/auth/resolve-member-lifecycle-authority")>(
      "@/lib/auth/resolve-member-lifecycle-authority",
    );
    return {
      ...actual,
      resolveMemberLifecycleAuthority: async (...args: unknown[]) => {
        spy(...args);
        return result;
      },
    };
  });
  return spy;
}

describe("P2-4 PRODUCT_WRITE identity fail-closed", () => {
  beforeEach(() => vi.resetModules());

  it("session cookie + transient identity error → 503 auth_state_unavailable", async () => {
    mockIdentity(async () => ({ userId: null, transientError: true, terminalAuthFailure: false }));
    const { enforceApiMemberMutationPolicy } = await import("@/lib/auth/enforce-api-member-mutation-policy");
    const res = await enforceApiMemberMutationPolicy(req("/api/community/posts", "POST", SESSION_COOKIE));
    expect(res?.status).toBe(503);
    expect((await res!.json()).code).toBe("auth_state_unavailable");
  });

  it("session cookie + identity resolution throws → 503", async () => {
    mockIdentity(async () => {
      throw new Error("boom");
    });
    const { enforceApiMemberMutationPolicy } = await import("@/lib/auth/enforce-api-member-mutation-policy");
    const res = await enforceApiMemberMutationPolicy(req("/api/community/posts", "POST", SESSION_COOKIE));
    expect(res?.status).toBe(503);
  });

  it("no auth cookies + transient → pass through (route decides 401)", async () => {
    mockIdentity(async () => ({ userId: null, transientError: true, terminalAuthFailure: false }));
    const { enforceApiMemberMutationPolicy } = await import("@/lib/auth/enforce-api-member-mutation-policy");
    expect(await enforceApiMemberMutationPolicy(req("/api/community/posts", "POST"))).toBeNull();
    // PKCE code-verifier only is not a session
    expect(
      await enforceApiMemberMutationPolicy(req("/api/community/posts", "POST", "sb-proj-auth-token-code-verifier=x")),
    ).toBeNull();
  });

  it("session cookie + terminal (expired) → pass through", async () => {
    mockIdentity(async () => ({ userId: null, transientError: false, terminalAuthFailure: true }));
    const { enforceApiMemberMutationPolicy } = await import("@/lib/auth/enforce-api-member-mutation-policy");
    expect(await enforceApiMemberMutationPolicy(req("/api/community/posts", "POST", SESSION_COOKIE))).toBeNull();
  });

  it("EXEMPT path is not gated even when identity throws", async () => {
    mockIdentity(async () => {
      throw new Error("boom");
    });
    const { enforceApiMemberMutationPolicy } = await import("@/lib/auth/enforce-api-member-mutation-policy");
    expect(await enforceApiMemberMutationPolicy(req("/api/auth/logout", "POST", SESSION_COOKIE))).toBeNull();
  });
});

describe("P2-6 GET read gate (blocked/withdrawn)", () => {
  beforeEach(() => vi.resetModules());

  const resolvedAs = (status: string, deleted_at: string | null = null): MemberLifecycleAuthorityResult => ({
    kind: "RESOLVED",
    profile: { status, deleted_at },
    lifecycle: deleted_at ? "withdrawn" : (status as "blocked" | "suspended" | "active"),
    source: "cache",
  });

  it("blocked → 403 account_restricted, uses cached authority (no bypassCache)", async () => {
    mockIdentity(async () => ({ userId: "u-blocked", transientError: false, terminalAuthFailure: false }));
    const spy = mockLifecycle(resolvedAs("blocked"));
    const { enforceApiMemberReadPolicy } = await import("@/lib/auth/enforce-api-member-read-policy");
    const res = await enforceApiMemberReadPolicy(req("/api/community-messenger/rooms", "GET", SESSION_COOKIE));
    expect(res?.status).toBe(403);
    expect((await res!.json()).code).toBe("account_restricted");
    expect(spy).toHaveBeenCalledWith("u-blocked");
  });

  it("withdrawn → 403", async () => {
    mockIdentity(async () => ({ userId: "u-w", transientError: false, terminalAuthFailure: false }));
    mockLifecycle(resolvedAs("deleted", "2026-01-01T00:00:00Z"));
    const { enforceApiMemberReadPolicy } = await import("@/lib/auth/enforce-api-member-read-policy");
    expect((await enforceApiMemberReadPolicy(req("/api/posts", "GET", SESSION_COOKIE)))?.status).toBe(403);
  });

  it("suspended / active → read allowed", async () => {
    mockIdentity(async () => ({ userId: "u-s", transientError: false, terminalAuthFailure: false }));
    mockLifecycle(resolvedAs("suspended"));
    const { enforceApiMemberReadPolicy } = await import("@/lib/auth/enforce-api-member-read-policy");
    expect(await enforceApiMemberReadPolicy(req("/api/posts", "GET", SESSION_COOKIE))).toBeNull();
  });

  it("lookup unavailable or throws → fail-open", async () => {
    mockIdentity(async () => ({ userId: "u-x", transientError: false, terminalAuthFailure: false }));
    mockLifecycle({ kind: "AUTHORITY_UNAVAILABLE", reason: "query_error" });
    const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
    const { enforceApiMemberReadPolicy } = await import("@/lib/auth/enforce-api-member-read-policy");
    expect(await enforceApiMemberReadPolicy(req("/api/posts", "GET", SESSION_COOKIE))).toBeNull();
    warn.mockRestore();
  });

  it("anonymous, exempt and admin paths skip identity entirely", async () => {
    const identity = vi.fn(async () => ({ userId: "u-blocked", transientError: false, terminalAuthFailure: false }));
    mockIdentity(identity);
    mockLifecycle(resolvedAs("blocked"));
    const { enforceApiMemberReadPolicy } = await import("@/lib/auth/enforce-api-member-read-policy");
    expect(await enforceApiMemberReadPolicy(req("/api/posts", "GET"))).toBeNull();
    for (const p of ["/api/admin/users", "/api/auth/session", "/api/support/cases", "/api/me/profile"]) {
      expect(await enforceApiMemberReadPolicy(req(p, "GET", SESSION_COOKIE))).toBeNull();
    }
    expect(await enforceApiMemberReadPolicy(req("/api/posts", "POST", SESSION_COOKIE))).toBeNull();
    expect(identity).not.toHaveBeenCalled();
  });
});
