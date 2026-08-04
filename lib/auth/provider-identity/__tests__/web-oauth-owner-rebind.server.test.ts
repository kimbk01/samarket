import { describe, expect, it, vi, beforeEach } from "vitest";
import type { User } from "@supabase/supabase-js";
import { NextRequest, NextResponse } from "next/server";
import {
  isSupabaseAuthCookieName,
  rebindWebOAuthSessionToOwner,
  wipeSupabaseAuthCookies,
} from "@/lib/auth/provider-identity/web-oauth-owner-rebind.server";

vi.mock("@/lib/auth/native/google-native-session.server", () => ({
  buildGoogleSupabasePassword: () => "Gg#test-password!",
}));

function makeUser(id: string, email: string): User {
  return {
    id,
    email,
    app_metadata: {},
    user_metadata: {},
    aud: "authenticated",
    created_at: "",
  } as User;
}

describe("wipeSupabaseAuthCookies", () => {
  it("expires chunked auth-token cookies", () => {
    const req = new NextRequest("https://samarket.vercel.app/auth/callback", {
      headers: {
        cookie: "sb-x-auth-token.0=aaa; sb-x-auth-token.1=bbb; other=keep",
      },
    });
    const res = NextResponse.redirect("https://samarket.vercel.app/");
    const wiped = wipeSupabaseAuthCookies(req, res);
    expect(wiped).toBeGreaterThanOrEqual(2);
    expect(isSupabaseAuthCookieName("sb-x-auth-token.0")).toBe(true);
    expect(isSupabaseAuthCookieName("other")).toBe(false);
    expect(res.cookies.get("sb-x-auth-token.0")?.value).toBe("");
  });
});

describe("rebindWebOAuthSessionToOwner", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.spyOn(console, "info").mockImplementation(() => undefined);
  });

  it("wipes auth cookies then password-signs owner (no magiclink)", async () => {
    const wipeAuthCookies = vi.fn(() => 3);
    const signOut = vi.fn(async () => ({ error: null }));
    const verifyOtp = vi.fn();
    const generateLink = vi.fn();
    const signInWithPassword = vi.fn(async () => ({
      data: { user: makeUser("owner-1", "owner@example.com") },
      error: null,
    }));
    const getUserById = vi.fn(async () => ({
      data: { user: makeUser("owner-1", "owner@example.com") },
      error: null,
    }));
    const updateUserById = vi.fn(async () => ({ data: { user: null }, error: null }));

    const adminSb = {
      auth: { admin: { getUserById, generateLink, updateUserById } },
    } as unknown as import("@supabase/supabase-js").SupabaseClient;
    const routeSb = {
      auth: { signOut, verifyOtp, signInWithPassword },
    } as unknown as import("@supabase/supabase-js").SupabaseClient;

    const result = await rebindWebOAuthSessionToOwner({
      adminSb,
      routeSb,
      temporaryUser: makeUser("temp-1", "temp@gmail.com"),
      ownerUserId: "owner-1",
      candidate: {
        provider: "google",
        providerUserId: "gid-1",
        email: "temp@gmail.com",
        emailVerified: true,
      },
      callbackAttemptId: "woc-rebind-1",
      wipeAuthCookies,
    });

    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(wipeAuthCookies).toHaveBeenCalled();
    expect(wipeAuthCookies.mock.calls.length).toBeGreaterThanOrEqual(2);
    expect(generateLink).not.toHaveBeenCalled();
    expect(verifyOtp).not.toHaveBeenCalled();
    expect(signInWithPassword).toHaveBeenCalledWith({
      email: "owner@example.com",
      password: "Gg#test-password!",
    });
  });
});
