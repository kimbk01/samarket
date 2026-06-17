import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

function createStorage(): Storage {
  const map = new Map<string, string>();
  return {
    get length() {
      return map.size;
    },
    clear: () => map.clear(),
    getItem: (key: string) => (map.has(key) ? map.get(key)! : null),
    key: (index: number) => [...map.keys()][index] ?? null,
    removeItem: (key: string) => {
      map.delete(key);
    },
    setItem: (key: string, value: string) => {
      map.set(key, value);
    },
  };
}

const fetchAuthSessionNoStore = vi.fn();
const wipeClientSessionState = vi.fn();
const signOut = vi.fn();
const getSession = vi.fn();
const refreshSession = vi.fn();
const getUser = vi.fn();

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
  runBrowserAuthRefreshDeduped: (_sb: unknown, _source: string) =>
    Promise.resolve({ data: { session: null }, error: null }),
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

describe("ensureSessionHealthy registry validation", () => {
  beforeEach(() => {
    vi.resetModules();
    vi.stubGlobal("window", {} as Window & typeof globalThis);
    vi.stubGlobal("sessionStorage", createStorage());
    fetchAuthSessionNoStore.mockReset();
    wipeClientSessionState.mockReset();
    signOut.mockReset();
    getSession.mockReset();
    wipeClientSessionState.mockResolvedValue(undefined);
    signOut.mockResolvedValue({ error: null });
  });

  afterEach(async () => {
    vi.unstubAllGlobals();
    const mod = await import("@/lib/auth/dibay-session-manager");
    mod.resetDibaySessionManagerForTests();
  });

  it("treats Supabase session with invalid registry as signed-out and wipes", async () => {
    getSession.mockResolvedValue({
      data: { session: { user: { id: "u1" } } },
      error: null,
    });
    fetchAuthSessionNoStore.mockResolvedValue(
      new Response(JSON.stringify({ authenticated: false }), { status: 401 })
    );

    const mod = await import("@/lib/auth/dibay-session-manager");
    mod.resetDibaySessionManagerForTests();
    const { markAuthBootstrapInitialSessionDone } = await import("@/lib/auth/auth-bootstrap-state");
    markAuthBootstrapInitialSessionDone(false);
    const result = await mod.ensureSessionHealthy("ghost-test");

    expect(result.ok).toBe(false);
    expect(result.phase).toBe("guest");
    expect(mod.getSessionPhase()).toBe("guest");
    expect(wipeClientSessionState).toHaveBeenCalledWith("user_logout", { setPostLogoutGuard: false });
    expect(signOut).toHaveBeenCalledWith({ scope: "local" });
  });
});
