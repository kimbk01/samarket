import { afterEach, describe, expect, it, vi } from "vitest";

const clearGuestAuthState = vi.fn();
const clearAuthSessionClientCache = vi.fn();
const invalidateClientMembershipResolveFlight = vi.fn();
const awaitClientSupabaseSessionReady = vi.fn(async () => undefined);
const primeClientAuthSessionFromSupabase = vi.fn(async () => true);
const dispatchTestAuthChanged = vi.fn();
const refreshSession = vi.fn(async () => ({ data: { session: null }, error: null }));
const getSession = vi.fn(async () => ({
  data: { session: { user: { id: "user-1" } } },
}));

vi.mock("@/lib/auth/guest-auth-state", () => ({
  clearGuestAuthState,
}));

vi.mock("@/lib/auth/fetch-auth-session-client", () => ({
  clearAuthSessionClientCache,
}));

vi.mock("@/lib/auth/resolve-client-profile-session", () => ({
  invalidateClientMembershipResolveFlight,
}));

vi.mock("@/lib/auth/await-client-supabase-session-ready", () => ({
  awaitClientSupabaseSessionReady,
}));

vi.mock("@/lib/auth/auth-session-immediate.client", () => ({
  primeClientAuthSessionFromSupabase,
}));

vi.mock("@/lib/auth/test-auth-store", () => ({
  dispatchTestAuthChanged,
}));

vi.mock("@/lib/auth/oauth/oauth-native-callback-log", () => ({
  logOAuthNativeEvent: vi.fn(),
}));

vi.mock("@/lib/supabase/client", () => ({
  getSupabaseClient: () => ({
    auth: {
      getSession,
      refreshSession,
    },
  }),
}));

describe("sync-client-session-after-native-exchange", () => {
  afterEach(() => {
    vi.clearAllMocks();
    vi.resetModules();
    vi.unstubAllGlobals();
  });

  it("clears guest gate and primes session after native exchange", async () => {
    vi.stubGlobal("window", {});
    const { syncClientSessionAfterNativeExchange } = await import(
      "@/lib/auth/native/sync-client-session-after-native-exchange.client"
    );

    const ok = await syncClientSessionAfterNativeExchange();

    expect(ok).toBe(true);
    expect(clearGuestAuthState).toHaveBeenCalledTimes(1);
    expect(clearAuthSessionClientCache).toHaveBeenCalledTimes(1);
    expect(invalidateClientMembershipResolveFlight).toHaveBeenCalledTimes(1);
    expect(awaitClientSupabaseSessionReady).toHaveBeenCalled();
    expect(primeClientAuthSessionFromSupabase).toHaveBeenCalledTimes(1);
    expect(dispatchTestAuthChanged).toHaveBeenCalledTimes(1);
  });
});
