import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { AuthApiError, AuthRetryableFetchError } from "@supabase/supabase-js";
import { SharedFlightDeadlineError } from "@/lib/http/shared-flight-deadline";

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
const getUser = vi.fn();
const runBrowserAuthRefreshDeduped = vi.fn();
const projectNativeMemberEventEligibility = vi.fn();

vi.mock("@/lib/push/native/member-call-eligibility-bridge", () => ({
  projectNativeMemberEventEligibility: (...args: unknown[]) => projectNativeMemberEventEligibility(...args),
}));

vi.mock("@/lib/push/disconnect-native-devices-for-logout-client", () => ({
  disconnectNativeDevicesForLogout: vi.fn(),
}));

vi.mock("@/lib/auth/fetch-auth-session-client", () => ({
  fetchAuthSessionNoStore: (...args: unknown[]) => fetchAuthSessionNoStore(...args),
  clearAuthSessionClientCache: vi.fn(),
}));

vi.mock("@/lib/auth/client-session-wipe", () => ({
  wipeClientSessionState: (...args: unknown[]) => wipeClientSessionState(...args),
  shouldSkipSignedOutEventWipe: () => false,
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
      refreshSession: vi.fn(),
      onAuthStateChange: () => ({ data: { subscription: { unsubscribe: vi.fn() } } }),
    },
  }),
}));

async function flushEligibilityImports(): Promise<void> {
  for (let i = 0; i < 5; i++) await new Promise((r) => setTimeout(r, 0));
}

describe("ensureSessionHealthy — transient refresh failure", () => {
  beforeEach(() => {
    vi.resetModules();
    vi.stubGlobal("window", {} as Window & typeof globalThis);
    vi.stubGlobal("sessionStorage", createStorage());
    for (const m of [
      fetchAuthSessionNoStore,
      wipeClientSessionState,
      signOut,
      getSession,
      getUser,
      runBrowserAuthRefreshDeduped,
      projectNativeMemberEventEligibility,
    ]) {
      m.mockReset();
    }
    runBrowserAuthRefreshDeduped.mockResolvedValue({ data: { session: null }, error: null });
    getUser.mockResolvedValue({ data: { user: null }, error: null });
  });

  afterEach(async () => {
    vi.unstubAllGlobals();
    const mod = await import("@/lib/auth/dibay-session-manager");
    mod.resetDibaySessionManagerForTests();
  });

  it("retryable refresh error from getSession → loading, no second refresh, no guest, no eligibility change", async () => {
    getSession.mockResolvedValue({
      data: { session: null },
      error: new AuthRetryableFetchError("supabase auth request deadline 10000ms exceeded", 0),
    });

    const mod = await import("@/lib/auth/dibay-session-manager");
    mod.resetDibaySessionManagerForTests();
    const result = await mod.ensureSessionHealthy("transient-test");
    await flushEligibilityImports();

    expect(result).toEqual({ ok: false, phase: "loading", terminal: false });
    expect(mod.getSessionPhase()).toBe("loading");
    expect(runBrowserAuthRefreshDeduped).not.toHaveBeenCalled();
    expect(getUser).not.toHaveBeenCalled();
    expect(fetchAuthSessionNoStore).not.toHaveBeenCalled();
    expect(wipeClientSessionState).not.toHaveBeenCalled();
    expect(signOut).not.toHaveBeenCalled();
    expect(projectNativeMemberEventEligibility).not.toHaveBeenCalled();
  });

  it("non-retryable refresh error keeps the existing recovery path (refresh → corrupt on terminal code)", async () => {
    getSession.mockResolvedValue({
      data: { session: null },
      error: new AuthApiError("Invalid Refresh Token: Already Used", 400, "refresh_token_already_used"),
    });
    runBrowserAuthRefreshDeduped.mockResolvedValue({
      data: { session: null },
      error: { code: "refresh_token_not_found", message: "Invalid Refresh Token" },
    });

    const mod = await import("@/lib/auth/dibay-session-manager");
    mod.resetDibaySessionManagerForTests();
    const result = await mod.ensureSessionHealthy("revoked-test");

    expect(runBrowserAuthRefreshDeduped).toHaveBeenCalledTimes(1);
    expect(result).toEqual({ ok: false, phase: "corrupt", terminal: true });
  });

  it("valid session → authenticated and call eligibility projected true (unchanged)", async () => {
    getSession.mockResolvedValue({ data: { session: { user: { id: "u1" } } }, error: null });
    fetchAuthSessionNoStore.mockResolvedValue(new Response(JSON.stringify({ ok: true }), { status: 200 }));

    const mod = await import("@/lib/auth/dibay-session-manager");
    mod.resetDibaySessionManagerForTests();
    const result = await mod.ensureSessionHealthy("member-test");
    await flushEligibilityImports();

    expect(result).toEqual({ ok: true, phase: "authenticated" });
    expect(projectNativeMemberEventEligibility).toHaveBeenCalledTimes(1);
    expect(projectNativeMemberEventEligibility).toHaveBeenCalledWith(
      expect.objectContaining({ eligible: true, boundUserId: "u1" }),
    );
  });

  it("session API deadline (SharedFlightDeadlineError) → loading, not guest", async () => {
    getSession.mockResolvedValue({ data: { session: null }, error: null });
    fetchAuthSessionNoStore.mockRejectedValue(new SharedFlightDeadlineError("auth_session_get", 12_000));

    const mod = await import("@/lib/auth/dibay-session-manager");
    mod.resetDibaySessionManagerForTests();
    const result = await mod.ensureSessionHealthy("deadline-test");
    await flushEligibilityImports();

    expect(result).toEqual({ ok: false, phase: "loading", terminal: false });
    expect(projectNativeMemberEventEligibility).not.toHaveBeenCalled();
  });

  it("session API 401 without any Supabase session → recovering (existing guest-recovery path)", async () => {
    getSession.mockResolvedValue({ data: { session: null }, error: null });
    fetchAuthSessionNoStore.mockResolvedValue(new Response(JSON.stringify({ authenticated: false }), { status: 401 }));

    const mod = await import("@/lib/auth/dibay-session-manager");
    mod.resetDibaySessionManagerForTests();
    const result = await mod.ensureSessionHealthy("guest-test");

    expect(result).toEqual({ ok: false, phase: "recovering", terminal: false });
  });
});
