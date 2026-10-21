import { describe, expect, it, vi, beforeEach } from "vitest";
import type { User } from "@supabase/supabase-js";
import { NextRequest, NextResponse } from "next/server";
import {
  isSupabaseAuthCookieName,
  issueOwnerSessionOnRouteClient,
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

function mockAdminSb(opts: {
  profileIds: string[];
  getUserById: ReturnType<typeof vi.fn>;
  updateUserById: ReturnType<typeof vi.fn>;
  generateLink: ReturnType<typeof vi.fn>;
}) {
  return {
    auth: {
      admin: {
        getUserById: opts.getUserById,
        generateLink: opts.generateLink,
        updateUserById: opts.updateUserById,
      },
    },
    from: vi.fn((table: string) => {
      const state: Record<string, unknown> = {};
      const builder = {
        select: vi.fn(() => builder),
        eq: vi.fn((col: string, val: unknown) => {
          state[col] = val;
          return builder;
        }),
        maybeSingle: vi.fn(async () => {
          if (table !== "profiles") return { data: null, error: null };
          const id = String(state.id ?? "");
          const hit = opts.profileIds.includes(id);
          return { data: hit ? { id } : null, error: null };
        }),
      };
      return builder;
    }),
  } as unknown as import("@supabase/supabase-js").SupabaseClient;
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

  it("T16: profile-less temporary user — Google rebind uses magiclink primary (no password overwrite)", async () => {
    const wipeAuthCookies = vi.fn(() => 3);
    const signOut = vi.fn(async () => ({ error: null }));
    const verifyOtp = vi.fn(async () => ({
      data: { user: makeUser("owner-1", "owner@example.com"), session: { access_token: "x" } },
      error: null,
    }));
    const generateLink = vi.fn(async () => ({
      data: {
        properties: { hashed_token: "hash-owner-1" },
        user: makeUser("owner-1", "owner@example.com"),
      },
      error: null,
    }));
    const signInWithPassword = vi.fn();
    const getUserById = vi.fn(async () => ({
      data: { user: makeUser("owner-1", "owner@example.com") },
      error: null,
    }));
    const updateUserById = vi.fn(async () => ({ data: { user: null }, error: null }));

    const adminSb = mockAdminSb({
      profileIds: ["owner-1"],
      getUserById,
      updateUserById,
      generateLink,
    });
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
    expect(wipeAuthCookies.mock.calls.length).toBeGreaterThanOrEqual(2);
    expect(generateLink).toHaveBeenCalledWith({ type: "magiclink", email: "owner@example.com" });
    expect(verifyOtp).toHaveBeenCalledWith({ type: "magiclink", token_hash: "hash-owner-1" });
    expect(signInWithPassword).not.toHaveBeenCalled();
    // Owner password never touched; only landing-pad tombstone on temp user.
    for (const call of updateUserById.mock.calls as unknown as Array<[string, Record<string, unknown>]>) {
      expect(call[0]).toBe("temp-1");
      expect(call[1]).not.toHaveProperty("password");
    }
    // signOut(temp) happens before owner session cookies are written.
    expect(signOut.mock.invocationCallOrder[0]).toBeLessThan(verifyOtp.mock.invocationCallOrder[0]);
  });

  it("Google fallback: magiclink failure → deterministic password + signInWithPassword", async () => {
    const wipeAuthCookies = vi.fn(() => 3);
    const signOut = vi.fn(async () => ({ error: null }));
    const verifyOtp = vi.fn();
    const generateLink = vi.fn(async () => ({
      data: { properties: null, user: null },
      error: { message: "generate_failed" },
    }));
    const signInWithPassword = vi.fn(async () => ({
      data: { user: makeUser("owner-1", "owner@example.com") },
      error: null,
    }));
    const getUserById = vi.fn(async () => ({
      data: { user: makeUser("owner-1", "owner@example.com") },
      error: null,
    }));
    const updateUserById = vi.fn(async () => ({ data: { user: null }, error: null }));

    const adminSb = mockAdminSb({
      profileIds: ["owner-1"],
      getUserById,
      updateUserById,
      generateLink,
    });
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
      callbackAttemptId: "woc-rebind-fallback",
      wipeAuthCookies,
    });

    expect(result.ok).toBe(true);
    expect(verifyOtp).not.toHaveBeenCalled();
    expect(updateUserById).toHaveBeenCalledWith("owner-1", {
      password: "Gg#test-password!",
      email_confirm: true,
    });
    expect(signInWithPassword).toHaveBeenCalledWith({
      email: "owner@example.com",
      password: "Gg#test-password!",
    });
  });

  it.each([
    ["kakao", "kakao-native-1", "kakao.12345@kakao.dibay.internal"],
    ["apple", "apple-sub-1", "apple.abc@apple.dibay.internal"],
  ] as const)(
    "P1-5: %s rebind succeeds via magiclink (synthetic owner email, no password write)",
    async (provider, subject, ownerEmail) => {
      const wipeAuthCookies = vi.fn(() => 2);
      const signOut = vi.fn(async () => ({ error: null }));
      const verifyOtp = vi.fn(async () => ({
        data: { user: makeUser("owner-n", ownerEmail), session: { access_token: "x" } },
        error: null,
      }));
      const generateLink = vi.fn(async () => ({
        data: { properties: { hashed_token: `hash-${provider}` }, user: makeUser("owner-n", ownerEmail) },
        error: null,
      }));
      const signInWithPassword = vi.fn();
      const getUserById = vi.fn(async () => ({
        data: { user: makeUser("owner-n", ownerEmail) },
        error: null,
      }));
      const updateUserById = vi.fn(async () => ({ data: { user: null }, error: null }));
      const adminSb = mockAdminSb({
        profileIds: ["owner-n"],
        getUserById,
        updateUserById,
        generateLink,
      });
      const routeSb = {
        auth: { signOut, verifyOtp, signInWithPassword },
      } as unknown as import("@supabase/supabase-js").SupabaseClient;

      const result = await rebindWebOAuthSessionToOwner({
        adminSb,
        routeSb,
        temporaryUser: makeUser(`temp-${provider}`, `temp@${provider}.example`),
        ownerUserId: "owner-n",
        candidate: { provider, providerUserId: subject, email: null, emailVerified: false },
        callbackAttemptId: `woc-rebind-${provider}`,
        wipeAuthCookies,
      });

      expect(result.ok).toBe(true);
      if (!result.ok) return;
      expect(result.ownerUser.id).toBe("owner-n");
      expect(result.disposeMode).toBe("landing_pad_tombstone");
      expect(generateLink).toHaveBeenCalledWith({ type: "magiclink", email: ownerEmail });
      expect(verifyOtp).toHaveBeenCalledWith({ type: "magiclink", token_hash: `hash-${provider}` });
      expect(signInWithPassword).not.toHaveBeenCalled();
      expect(updateUserById).toHaveBeenCalledTimes(1);
      expect((updateUserById.mock.calls as unknown as Array<[string]>)[0]?.[0]).toBe(`temp-${provider}`);
      expect(signOut.mock.invocationCallOrder[0]).toBeLessThan(verifyOtp.mock.invocationCallOrder[0]);
      // Tombstone only after owner session verified.
      expect(verifyOtp.mock.invocationCallOrder[0]).toBeLessThan(
        updateUserById.mock.invocationCallOrder[0],
      );
    },
  );

  it("P1-5: non-Google magiclink failure fails closed with oauth_rebind_failed (no password fallback)", async () => {
    const wipeAuthCookies = vi.fn(() => 2);
    const signOut = vi.fn(async () => ({ error: null }));
    const verifyOtp = vi.fn(async () => ({
      data: { user: null, session: null },
      error: { message: "otp_expired" },
    }));
    const generateLink = vi.fn(async () => ({
      data: { properties: { hashed_token: "hash-k" }, user: makeUser("owner-k", "kakao.1@x.internal") },
      error: null,
    }));
    const signInWithPassword = vi.fn();
    const getUserById = vi.fn(async () => ({
      data: { user: makeUser("owner-k", "kakao.1@x.internal") },
      error: null,
    }));
    const updateUserById = vi.fn(async () => ({ data: { user: null }, error: null }));
    const adminSb = mockAdminSb({
      profileIds: ["owner-k"],
      getUserById,
      updateUserById,
      generateLink,
    });
    const routeSb = {
      auth: { signOut, verifyOtp, signInWithPassword },
    } as unknown as import("@supabase/supabase-js").SupabaseClient;

    const result = await rebindWebOAuthSessionToOwner({
      adminSb,
      routeSb,
      temporaryUser: makeUser("temp-k", "temp@kakao.example"),
      ownerUserId: "owner-k",
      candidate: { provider: "kakao", providerUserId: "kakao-9" },
      callbackAttemptId: "woc-rebind-kakao-fail",
      wipeAuthCookies,
    });

    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.errorCode).toBe("oauth_rebind_failed");
    expect(signInWithPassword).not.toHaveBeenCalled();
    expect(updateUserById).not.toHaveBeenCalled();
  });

  it("issueOwnerSessionOnRouteClient rejects magiclink session for a different user", async () => {
    const signOut = vi.fn(async () => ({ error: null }));
    const verifyOtp = vi.fn(async () => ({
      data: { user: makeUser("someone-else", "x@y.z"), session: { access_token: "x" } },
      error: null,
    }));
    const generateLink = vi.fn(async () => ({
      data: { properties: { hashed_token: "h" }, user: null },
      error: null,
    }));
    const adminSb = mockAdminSb({
      profileIds: [],
      getUserById: vi.fn(async () => ({ data: { user: makeUser("owner-a", "a@b.c") }, error: null })),
      updateUserById: vi.fn(),
      generateLink,
    });
    const routeSb = {
      auth: { signOut, verifyOtp, signInWithPassword: vi.fn() },
    } as unknown as import("@supabase/supabase-js").SupabaseClient;

    await expect(
      issueOwnerSessionOnRouteClient({
        adminSb,
        routeSb,
        ownerUserId: "owner-a",
        candidate: { provider: "apple", providerUserId: "apple-x" },
      }),
    ).rejects.toThrow("owner_magiclink_user_mismatch");
    expect(signOut).toHaveBeenCalledWith({ scope: "local" });
  });

  it("T15: defense-in-depth rejects profile-bearing temporaryUser before destructive ops", async () => {
    const wipeAuthCookies = vi.fn(() => 3);
    const signOut = vi.fn(async () => ({ error: null }));
    const signInWithPassword = vi.fn();
    const getUserById = vi.fn();
    const updateUserById = vi.fn();
    const generateLink = vi.fn();

    const adminSb = mockAdminSb({
      profileIds: ["established-v", "owner-u"],
      getUserById,
      updateUserById,
      generateLink,
    });
    const routeSb = {
      auth: { signOut, signInWithPassword },
    } as unknown as import("@supabase/supabase-js").SupabaseClient;

    const result = await rebindWebOAuthSessionToOwner({
      adminSb,
      routeSb,
      temporaryUser: makeUser("established-v", "v@example.com"),
      ownerUserId: "owner-u",
      candidate: {
        provider: "google",
        providerUserId: "gid-split",
        email: "v@example.com",
        emailVerified: true,
      },
      callbackAttemptId: "woc-rebind-defense",
      wipeAuthCookies,
    });

    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.errorCode).toBe("provider_account_reconciliation_required");
    expect(wipeAuthCookies).not.toHaveBeenCalled();
    expect(signOut).not.toHaveBeenCalled();
    expect(getUserById).not.toHaveBeenCalled();
    expect(updateUserById).not.toHaveBeenCalled();
    expect(signInWithPassword).not.toHaveBeenCalled();
  });
});
