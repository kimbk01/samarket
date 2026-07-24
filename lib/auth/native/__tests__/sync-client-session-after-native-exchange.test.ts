import { afterEach, describe, expect, it, vi } from "vitest";

const runBrowserAuthRefreshDeduped = vi.fn(async () => ({
  data: { session: null, user: null },
  error: null,
}));

vi.mock("@/lib/supabase/auth-refresh-telemetry", () => ({
  runBrowserAuthRefreshDeduped: (...args: unknown[]) =>
    runBrowserAuthRefreshDeduped(...(args as [])),
}));

vi.mock("@/lib/auth/auth-session-immediate.client", () => ({
  primeClientAuthSessionFromSupabase: vi.fn(async () => false),
}));

vi.mock("@/lib/auth/await-client-supabase-session-ready", () => ({
  awaitClientSupabaseSessionReady: vi.fn(async () => undefined),
}));

vi.mock("@/lib/auth/fetch-auth-session-client", () => ({
  clearAuthSessionClientCache: vi.fn(),
}));

vi.mock("@/lib/auth/guest-auth-state", () => ({
  clearGuestAuthState: vi.fn(),
}));

vi.mock("@/lib/auth/oauth/oauth-native-callback-log", () => ({
  logOAuthNativeEvent: vi.fn(),
}));

vi.mock("@/lib/auth/resolve-client-profile-session", () => ({
  invalidateClientMembershipResolveFlight: vi.fn(),
}));

vi.mock("@/lib/auth/test-auth-store", () => ({
  dispatchTestAuthChanged: vi.fn(),
}));

const directRefreshSession = vi.fn(async () => ({ data: { session: null }, error: null }));

vi.mock("@/lib/supabase/client", () => ({
  getSupabaseClient: () => ({
    auth: {
      getSession: async () => ({ data: { session: null } }),
      refreshSession: directRefreshSession,
    },
  }),
}));

describe("syncClientSessionAfterNativeExchange", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
    vi.clearAllMocks();
  });

  it("P0-2: native sync refreshes only through the canonical single-flight authority", async () => {
    vi.stubGlobal("window", {});
    const { syncClientSessionAfterNativeExchange } = await import(
      "@/lib/auth/native/sync-client-session-after-native-exchange.client"
    );

    await syncClientSessionAfterNativeExchange();

    expect(runBrowserAuthRefreshDeduped).toHaveBeenCalledTimes(1);
    expect(runBrowserAuthRefreshDeduped).toHaveBeenCalledWith(
      expect.anything(),
      "native_exchange_sync",
      { allowRecoverableGuest: true },
    );
    expect(directRefreshSession).not.toHaveBeenCalled();
  });
});
