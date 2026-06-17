import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const fetchAuthSessionNoStore = vi.fn();
const wipeClientSessionState = vi.fn();
const signOut = vi.fn();
const getSession = vi.fn();
const refreshSession = vi.fn();
const getUser = vi.fn();
const runBrowserAuthRefreshDeduped = vi.fn();

vi.mock("@/lib/auth/fetch-auth-session-client", () => ({
  fetchAuthSessionNoStore: (...args: unknown[]) => fetchAuthSessionNoStore(...args),
  clearAuthSessionClientCache: vi.fn(),
}));

vi.mock("@/lib/auth/client-session-wipe", () => ({
  wipeClientSessionState: (...args: unknown[]) => wipeClientSessionState(...args),
}));

vi.mock("@/lib/auth/dedupe-supabase-get-user-client", () => ({
  dedupeSupabaseAuthGetUser: (sb: { auth: { getUser: typeof getUser } }) => sb.auth.getUser(),
}));

vi.mock("@/lib/supabase/auth-refresh-telemetry", () => ({
  runBrowserAuthRefreshDeduped: (...args: unknown[]) => runBrowserAuthRefreshDeduped(...args),
}));

vi.mock("@/lib/supabase/client", () => ({
  getSupabaseClient: () => ({
    auth: {
      getSession,
      signOut,
      getUser,
      refreshSession,
      onAuthStateChange: () => ({ data: { subscription: { unsubscribe: vi.fn() } } }),
    },
  }),
}));

describe("ensureSessionHealthy guest dedupe", () => {
  beforeEach(() => {
    vi.resetModules();
    vi.stubGlobal("window", {} as Window & typeof globalThis);
    vi.spyOn(console, "info").mockImplementation(() => {});
    fetchAuthSessionNoStore.mockReset();
    wipeClientSessionState.mockReset();
    signOut.mockReset();
    getSession.mockReset();
    getUser.mockReset();
    runBrowserAuthRefreshDeduped.mockReset();
    wipeClientSessionState.mockResolvedValue(undefined);
    signOut.mockResolvedValue({ error: null });
    getSession.mockResolvedValue({ data: { session: null }, error: null });
    getUser.mockResolvedValue({ data: { user: null }, error: null });
    runBrowserAuthRefreshDeduped.mockResolvedValue({ data: { session: null }, error: null });
    fetchAuthSessionNoStore.mockResolvedValue(
      new Response(JSON.stringify({ authenticated: false }), { status: 401 })
    );
  });

  afterEach(async () => {
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
    const mod = await import("@/lib/auth/dibay-session-manager");
    mod.resetDibaySessionManagerForTests();
  });

  it("runs refresh only once for parallel ensureSessionHealthy callers", async () => {
    const mod = await import("@/lib/auth/dibay-session-manager");
    const bootstrap = await import("@/lib/auth/auth-bootstrap-state");
    mod.resetDibaySessionManagerForTests();
    bootstrap.markAuthBootstrapInitialSessionDone(false);

    const [a, b] = await Promise.all([
      mod.ensureSessionHealthy("caller_a"),
      mod.ensureSessionHealthy("caller_b"),
    ]);

    expect(a.phase).toBe("guest");
    expect(b.phase).toBe("guest");
    expect(mod.getSessionPhase()).toBe("guest");
    expect(runBrowserAuthRefreshDeduped).toHaveBeenCalledTimes(1);
  });

  it("skips refresh after guest is established", async () => {
    const mod = await import("@/lib/auth/dibay-session-manager");
    const bootstrap = await import("@/lib/auth/auth-bootstrap-state");
    mod.resetDibaySessionManagerForTests();
    bootstrap.markAuthBootstrapInitialSessionDone(false);

    await mod.ensureSessionHealthy("first");
    runBrowserAuthRefreshDeduped.mockClear();
    fetchAuthSessionNoStore.mockClear();

    const second = await mod.ensureSessionHealthy("second");
    expect(second.phase).toBe("guest");
    expect(runBrowserAuthRefreshDeduped).not.toHaveBeenCalled();
    expect(fetchAuthSessionNoStore).not.toHaveBeenCalled();
  });
});
