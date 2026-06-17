import { describe, expect, it } from "vitest";
import { NextRequest } from "next/server";
import {
  buildMissingAuthCookie401Response,
  cookieHeaderHasSupabaseAuthCookies,
  isSupabaseAuthCookieName,
  requestHasSupabaseAuthCookies,
} from "@/lib/auth/route-handler-auth-fast-guard";

describe("route-handler-auth-fast-guard", () => {
  it("detects supabase auth cookie names", () => {
    expect(isSupabaseAuthCookieName("sb-localhost-auth-token")).toBe(true);
    expect(isSupabaseAuthCookieName("sb-localhost-auth-token.0")).toBe(true);
    expect(isSupabaseAuthCookieName("sb-localhost-auth-code-verifier")).toBe(true);
    expect(isSupabaseAuthCookieName("supabase.auth.token")).toBe(true);
    expect(isSupabaseAuthCookieName("session_id")).toBe(false);
  });

  it("returns false for empty cookie header", () => {
    expect(cookieHeaderHasSupabaseAuthCookies("")).toBe(false);
    expect(cookieHeaderHasSupabaseAuthCookies("foo=bar; lang=ko")).toBe(false);
  });

  it("returns true when auth cookie exists in header", () => {
    expect(
      cookieHeaderHasSupabaseAuthCookies("foo=bar; sb-test-auth-token=abc; lang=ko"),
    ).toBe(true);
  });

  it("requestHasSupabaseAuthCookies reads NextRequest cookies", () => {
    const req = new NextRequest("https://example.com/api/auth/session", {
      headers: {
        cookie: "sb-test-auth-token=abc",
      },
    });
    expect(requestHasSupabaseAuthCookies(req)).toBe(true);
  });

  it("buildMissingAuthCookie401Response is 401 with reason", async () => {
    const res = buildMissingAuthCookie401Response();
    expect(res.status).toBe(401);
    expect(res.headers.get("Cache-Control")).toBe("no-store");
    const body = (await res.json()) as { ok: boolean; reason: string };
    expect(body.ok).toBe(false);
    expect(body.reason).toBe("missing_auth_cookie");
  });
});
