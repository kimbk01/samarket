/**
 * B1 — Lifecycle restore / Safe Entry never replaces an auth / terms / onboarding surface.
 * B2 — accountKey is read from the @supabase/ssr session cookie (not always "guest").
 */
import { describe, expect, it } from "vitest";
import { isLifecycleAuthSurfacePath } from "@/lib/lifecycle/lifecycle-route-effects.client";
import { readAccountKeyFromSupabaseCookies } from "@/lib/lifecycle/restore-envelope";

function b64url(s: string): string {
  return Buffer.from(s, "utf8").toString("base64").replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

describe("B1 lifecycle auth surface", () => {
  it("terms / login / onboarding are auth surfaces", () => {
    for (const p of [
      "/auth/onboarding/terms",
      "/auth/onboarding/terms?next=%2Fphilife",
      "/auth/callback",
      "/login",
      "/login/email",
      "/signup",
      "/onboarding/address",
    ]) {
      expect(isLifecycleAuthSurfacePath(p), p).toBe(true);
    }
  });
  it("product surfaces are not", () => {
    for (const p of ["/", "/philife", "/market", "/mypage", "/authors", "/loginx", "/community-messenger"]) {
      expect(isLifecycleAuthSurfacePath(p), p).toBe(false);
    }
  });
});

describe("B2 account key from Supabase session cookie", () => {
  const session = JSON.stringify({ access_token: "a", user: { id: "11111111-2222-3333-4444-555555555555" } });

  it("base64- encoded single cookie", () => {
    const cookie = `other=1; sb-abc-auth-token=base64-${b64url(session)}; x=y`;
    expect(readAccountKeyFromSupabaseCookies(cookie)).toBe("11111111-2222-3333-4444-555555555555");
  });

  it("chunked cookie (.0 .1) joined in order", () => {
    const enc = `base64-${b64url(session)}`;
    const mid = Math.floor(enc.length / 2);
    const cookie = `sb-abc-auth-token.1=${enc.slice(mid)}; sb-abc-auth-token.0=${enc.slice(0, mid)}`;
    expect(readAccountKeyFromSupabaseCookies(cookie)).toBe("11111111-2222-3333-4444-555555555555");
  });

  it("raw URI-encoded JSON cookie", () => {
    const cookie = `sb-abc-auth-token=${encodeURIComponent(session)}`;
    expect(readAccountKeyFromSupabaseCookies(cookie)).toBe("11111111-2222-3333-4444-555555555555");
  });

  it("no session cookie / garbage → null (caller falls back to guest)", () => {
    expect(readAccountKeyFromSupabaseCookies("a=b; c=d")).toBeNull();
    expect(readAccountKeyFromSupabaseCookies("sb-abc-auth-token=base64-@@@")).toBeNull();
    expect(readAccountKeyFromSupabaseCookies("sb-abc-auth-token-code-verifier=xyz")).toBeNull();
  });
});
