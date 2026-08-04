import { describe, expect, it, vi, beforeEach } from "vitest";
import type { User } from "@supabase/supabase-js";
import { rebindWebOAuthSessionToOwner } from "@/lib/auth/provider-identity/web-oauth-owner-rebind.server";

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

describe("rebindWebOAuthSessionToOwner", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.spyOn(console, "info").mockImplementation(() => undefined);
  });

  it("issues owner session via magiclink and tombstones parallel user (no delete)", async () => {
    const signOut = vi.fn(async () => ({ error: null }));
    const verifyOtp = vi.fn(async () => ({
      data: { user: makeUser("owner-1", "owner@example.com"), session: {} },
      error: null,
    }));
    const signInWithPassword = vi.fn();
    const getUserById = vi.fn(async () => ({
      data: { user: makeUser("owner-1", "owner@example.com") },
      error: null,
    }));
    const generateLink = vi.fn(async () => ({
      data: { properties: { hashed_token: "tok-hash" } },
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
    });

    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.ownerUser.id).toBe("owner-1");
    expect(result.disposeMode).toBe("landing_pad_tombstone");
    expect(signOut).toHaveBeenCalledTimes(1);
    expect(verifyOtp).toHaveBeenCalledWith({ type: "email", token_hash: "tok-hash" });
    expect(signInWithPassword).not.toHaveBeenCalled();
    expect(updateUserById).toHaveBeenCalledTimes(1);
    const updateArgs = updateUserById.mock.calls[0] as unknown as [string, { email?: string }];
    expect(String(updateArgs[1]?.email)).toContain("@oauth-landing.dibay.internal");
  });

  it("falls back to password sign-in when magiclink fails", async () => {
    const signOut = vi.fn(async () => ({ error: null }));
    const verifyOtp = vi.fn(async () => ({
      data: { user: null, session: null },
      error: { message: "bad token" },
    }));
    const signInWithPassword = vi.fn(async () => ({
      data: { user: makeUser("owner-1", "owner@example.com") },
      error: null,
    }));
    const getUserById = vi.fn(async () => ({
      data: { user: makeUser("owner-1", "owner@example.com") },
      error: null,
    }));
    const generateLink = vi.fn(async () => ({
      data: { properties: { hashed_token: "tok-hash" } },
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
      temporaryUser: makeUser("temp-2", "temp2@gmail.com"),
      ownerUserId: "owner-1",
      candidate: {
        provider: "google",
        providerUserId: "gid-2",
        email: null,
      },
      callbackAttemptId: "woc-rebind-2",
    });

    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(signInWithPassword).toHaveBeenCalledTimes(1);
    expect(result.ownerUser.id).toBe("owner-1");
  });
});
