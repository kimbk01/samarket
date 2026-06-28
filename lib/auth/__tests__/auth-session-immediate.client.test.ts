import { afterEach, describe, expect, it, vi } from "vitest";

const setAppBootAnonymous = vi.fn();
const setAppBootLoading = vi.fn();
const setSupabaseProfileCache = vi.fn();
const bindAuthUserId = vi.fn();
const dispatchTestAuthChanged = vi.fn();

vi.mock("@/lib/app-boot/app-boot-store", () => ({
  setAppBootAnonymous,
  setAppBootLoading,
}));

vi.mock("@/lib/auth/client-instance-id", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/lib/auth/client-instance-id")>();
  return {
    ...actual,
    bindAuthUserId,
  };
});

vi.mock("@/lib/auth/dibay-session-manager", () => ({
  markSessionAuthenticatedFromClient: vi.fn(),
}));

vi.mock("@/lib/auth/guest-auth-boot-markers", () => ({
  logGuestAuthBootMarker: vi.fn(),
}));

vi.mock("@/lib/auth/fetch-auth-session-client", () => ({
  clearAuthSessionClientCache: vi.fn(),
}));

vi.mock("@/lib/auth/resolve-client-profile-session", () => ({
  invalidateClientMembershipResolveFlight: vi.fn(),
}));

vi.mock("@/lib/auth/test-auth-store", () => ({
  dispatchTestAuthChanged,
}));

vi.mock("@/lib/auth/supabase-profile-cache", () => ({
  sessionToProfile: () => ({ id: "user-1", email: "a@test.local", nickname: "A", display_name: "A" }),
  setSupabaseProfileCache,
}));

describe("auth-session-immediate.client", () => {
  afterEach(() => {
    vi.resetModules();
    vi.unstubAllGlobals();
    vi.clearAllMocks();
  });

  it("primeClientAuthSessionFromSupabase hydrates profile cache from session", async () => {
    vi.stubGlobal("window", {});
    vi.doMock("@/lib/auth/await-client-supabase-session-ready", () => ({
      awaitClientSupabaseSessionReady: vi.fn(async () => undefined),
    }));
    vi.doMock("@/lib/auth/guest-auth-state", () => ({
      clearGuestAuthState: vi.fn(),
    }));
    vi.doMock("@/lib/supabase/client", () => ({
      getSupabaseClient: () => ({
        auth: {
          getSession: async () => ({
            data: { session: { user: { id: "user-1", email: "a@test.local" } } },
          }),
          refreshSession: async () => ({ data: { session: null }, error: null }),
        },
      }),
    }));

    const { primeClientAuthSessionFromSupabase, applyImmediateLogoutClientState } = await import(
      "@/lib/auth/auth-session-immediate.client"
    );

    const ok = await primeClientAuthSessionFromSupabase();
    expect(ok).toBe(true);
    expect(bindAuthUserId).toHaveBeenCalledWith("user-1");
    expect(setSupabaseProfileCache).toHaveBeenCalled();
    expect(setAppBootLoading).toHaveBeenCalled();
    expect(dispatchTestAuthChanged).toHaveBeenCalled();

    applyImmediateLogoutClientState();
    expect(setAppBootAnonymous).toHaveBeenCalled();
  });
});
