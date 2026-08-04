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

  it("issues owner session via password only (no magiclink) and tombstones pad", async () => {
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
    });

    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.ownerUser.id).toBe("owner-1");
    expect(result.disposeMode).toBe("landing_pad_tombstone");
    expect(signOut).toHaveBeenCalledTimes(1);
    expect(generateLink).not.toHaveBeenCalled();
    expect(verifyOtp).not.toHaveBeenCalled();
    expect(signInWithPassword).toHaveBeenCalledWith({
      email: "owner@example.com",
      password: "Gg#test-password!",
    });
    expect(updateUserById).toHaveBeenCalled();
    const passwordUpdate = updateUserById.mock.calls[0] as unknown as [
      string,
      { password?: string },
    ];
    expect(passwordUpdate[0]).toBe("owner-1");
    expect(passwordUpdate[1]?.password).toBe("Gg#test-password!");
    const tombstoneCall = (updateUserById.mock.calls as unknown as Array<[string, { email?: string }]>).find(
      (call) => String(call[1]?.email ?? "").includes("@oauth-landing.dibay.internal"),
    );
    expect(tombstoneCall).toBeTruthy();
  });

  it("fails closed when owner has no email", async () => {
    const signOut = vi.fn(async () => ({ error: null }));
    const getUserById = vi.fn(async () => ({
      data: { user: makeUser("owner-1", "") },
      error: null,
    }));

    const adminSb = {
      auth: {
        admin: {
          getUserById,
          updateUserById: vi.fn(),
          generateLink: vi.fn(),
        },
      },
    } as unknown as import("@supabase/supabase-js").SupabaseClient;
    const routeSb = {
      auth: {
        signOut,
        signInWithPassword: vi.fn(),
        verifyOtp: vi.fn(),
      },
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

    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.errorCode).toBe("oauth_rebind_failed");
    expect(result.message).toContain("owner_email_missing");
  });
});
