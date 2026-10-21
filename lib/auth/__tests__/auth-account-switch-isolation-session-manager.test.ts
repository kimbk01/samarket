/**
 * BUNDLE 4 — P0-2 (explicit logout broadcast 수신 탭 wipe+이동) · P2-10(a) (확정 terminal 에서만 로컬 wipe).
 * @see docs/dibay-auth-full-audit-ssot-design-2026-10-21.md
 */
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

const wipeClientSessionState = vi.fn();
const markExplicitLogoutWipeDone = vi.fn();
const navigateAfterAuthExitOnce = vi.fn();
const ensureAppBoot = vi.fn();
const fetchAuthSessionNoStore = vi.fn();
const refreshResult = vi.fn();
const getSession = vi.fn();
const getUser = vi.fn();

vi.mock("@/lib/auth/client-session-wipe", () => ({
  wipeClientSessionState: (...args: unknown[]) => wipeClientSessionState(...args),
  markExplicitLogoutWipeDone: (...args: unknown[]) => markExplicitLogoutWipeDone(...args),
  shouldSkipSignedOutEventWipe: () => false,
}));

vi.mock("@/lib/auth/auth-exit-coordinator", () => ({
  navigateAfterAuthExitOnce: (...args: unknown[]) => navigateAfterAuthExitOnce(...args),
}));

vi.mock("@/lib/app-boot/run-app-boot", () => ({
  ensureAppBoot: (...args: unknown[]) => ensureAppBoot(...args),
}));

vi.mock("@/lib/push/native/member-call-eligibility-bridge", () => ({
  projectNativeMemberEventEligibility: vi.fn(),
}));

vi.mock("@/lib/auth/fetch-auth-session-client", () => ({
  fetchAuthSessionNoStore: (...args: unknown[]) => fetchAuthSessionNoStore(...args),
  clearAuthSessionClientCache: vi.fn(),
}));

vi.mock("@/lib/auth/dedupe-supabase-get-user-client", () => ({
  dedupeSupabaseAuthGetUser: (sb: { auth: { getUser: typeof getUser } }) => sb.auth.getUser(),
}));

vi.mock("@/lib/supabase/auth-refresh-telemetry", () => ({
  runBrowserAuthRefreshDeduped: () => refreshResult(),
}));

vi.mock("@/lib/supabase/client", () => ({
  getSupabaseClient: () => ({
    auth: {
      getSession,
      getUser,
      signOut: vi.fn(),
      refreshSession: vi.fn(),
      onAuthStateChange: () => ({ data: { subscription: { unsubscribe: vi.fn() } } }),
    },
  }),
}));

const BOUND_KEY = "dibay:auth_bound_user_id";

describe("BUNDLE 4 — session manager account isolation", () => {
  let local: Storage;

  beforeEach(() => {
    vi.resetModules();
    local = createStorage();
    vi.stubGlobal("window", { localStorage: local, sessionStorage: createStorage() });
    vi.stubGlobal("localStorage", local);
    vi.stubGlobal("sessionStorage", createStorage());
    for (const fn of [
      wipeClientSessionState,
      markExplicitLogoutWipeDone,
      navigateAfterAuthExitOnce,
      ensureAppBoot,
      fetchAuthSessionNoStore,
      refreshResult,
      getSession,
      getUser,
    ]) {
      fn.mockReset();
    }
    wipeClientSessionState.mockResolvedValue(undefined);
    ensureAppBoot.mockResolvedValue(undefined);
    getSession.mockResolvedValue({ data: { session: null } });
    refreshResult.mockResolvedValue({ data: { session: null }, error: null });
    getUser.mockResolvedValue({ data: { user: null }, error: null });
  });

  afterEach(async () => {
    const mod = await import("@/lib/auth/dibay-session-manager");
    mod.resetDibaySessionManagerForTests();
    const tab = await import("@/lib/auth/client-instance-id");
    tab.resetTabAuthenticatedUserIdForTests();
    vi.unstubAllGlobals();
  });

  it("P0-2: explicit_logout broadcast → same user_logout wipe then hard post-logout navigation", async () => {
    const tab = await import("@/lib/auth/client-instance-id");
    tab.rememberTabAuthenticatedUserId("user-a");
    const mod = await import("@/lib/auth/dibay-session-manager");

    await mod.handleExplicitLogoutBroadcastForTests("user-a");

    expect(markExplicitLogoutWipeDone).toHaveBeenCalledTimes(1);
    expect(wipeClientSessionState).toHaveBeenCalledWith("user_logout");
    expect(navigateAfterAuthExitOnce).toHaveBeenCalledWith("logout");
    expect(mod.getSessionPhase()).toBe("terminal_guest");
    expect(wipeClientSessionState.mock.invocationCallOrder[0]).toBeLessThan(
      navigateAfterAuthExitOnce.mock.invocationCallOrder[0]!,
    );

    // 1회만 처리
    await mod.handleExplicitLogoutBroadcastForTests("user-a");
    expect(wipeClientSessionState).toHaveBeenCalledTimes(1);
  });

  it("P0-2: broadcast for another account is ignored when this tab is already a different user", async () => {
    const tab = await import("@/lib/auth/client-instance-id");
    tab.rememberTabAuthenticatedUserId("user-b");
    const mod = await import("@/lib/auth/dibay-session-manager");

    await mod.handleExplicitLogoutBroadcastForTests("user-a");

    expect(wipeClientSessionState).not.toHaveBeenCalled();
    expect(navigateAfterAuthExitOnce).not.toHaveBeenCalled();
  });

  it("P2-10a: unexpected SIGNED_OUT converging to corrupt with bound user → one local user_logout wipe + boot re-arm", async () => {
    local.setItem(BOUND_KEY, "user-a");
    refreshResult.mockResolvedValue({
      data: { session: null },
      error: { code: "refresh_token_not_found", message: "Invalid Refresh Token" },
    });
    const mod = await import("@/lib/auth/dibay-session-manager");

    mod.dispatchDibayAuthStateChangeForTests("SIGNED_OUT", null);

    await vi.waitFor(() => expect(wipeClientSessionState).toHaveBeenCalledWith("user_logout"));
    await vi.waitFor(() => expect(ensureAppBoot).toHaveBeenCalled());
    expect(wipeClientSessionState).toHaveBeenCalledTimes(1);
    expect(mod.getSessionPhase()).toBe("corrupt");
  });

  it("P2-10a: recovering (registry 401 without terminal code) is NOT treated as guest → no wipe", async () => {
    local.setItem(BOUND_KEY, "user-a");
    fetchAuthSessionNoStore.mockResolvedValue({
      ok: false,
      status: 401,
      clone: () => ({ json: async () => ({}) }),
    });
    const mod = await import("@/lib/auth/dibay-session-manager");

    mod.dispatchDibayAuthStateChangeForTests("SIGNED_OUT", null);

    await vi.waitFor(() => expect(fetchAuthSessionNoStore).toHaveBeenCalled());
    await new Promise((r) => setTimeout(r, 20));
    expect(wipeClientSessionState).not.toHaveBeenCalled();
  });

  it("P2-10a: loading (5xx) is NOT treated as guest → no wipe", async () => {
    local.setItem(BOUND_KEY, "user-a");
    fetchAuthSessionNoStore.mockResolvedValue({ ok: false, status: 503 });
    const mod = await import("@/lib/auth/dibay-session-manager");

    mod.dispatchDibayAuthStateChangeForTests("SIGNED_OUT", null);

    await vi.waitFor(() => expect(fetchAuthSessionNoStore).toHaveBeenCalled());
    await new Promise((r) => setTimeout(r, 20));
    expect(wipeClientSessionState).not.toHaveBeenCalled();
  });

  it("P2-10a: confirmed terminal without bound user → no wipe", async () => {
    refreshResult.mockResolvedValue({
      data: { session: null },
      error: { code: "refresh_token_not_found", message: "Invalid Refresh Token" },
    });
    const mod = await import("@/lib/auth/dibay-session-manager");

    mod.dispatchDibayAuthStateChangeForTests("SIGNED_OUT", null);

    await vi.waitFor(() => expect(mod.getSessionPhase()).toBe("corrupt"));
    await new Promise((r) => setTimeout(r, 20));
    expect(wipeClientSessionState).not.toHaveBeenCalled();
  });
});
