import { afterEach, describe, expect, it, vi } from "vitest";
import {
  getAuthRefreshInflightCount,
  resetAuthRefreshTelemetryForTests,
  runBrowserAuthRefreshDeduped,
} from "@/lib/supabase/auth-refresh-telemetry";
import {
  establishGuestAuthState,
  establishRecoverableGuestAuthState,
  resetGuestAuthStateForTests,
} from "@/lib/auth/guest-auth-state";
import type { SupabaseClient } from "@supabase/supabase-js";

describe("runBrowserAuthRefreshDeduped", () => {
  afterEach(() => {
    resetAuthRefreshTelemetryForTests();
    resetGuestAuthStateForTests();
    vi.restoreAllMocks();
  });

  it("joins concurrent refreshSession calls into one inflight promise", async () => {
    let resolveRefresh!: (value: { data: { session: null }; error: null }) => void;
    const refreshPromise = new Promise<{ data: { session: null }; error: null }>((resolve) => {
      resolveRefresh = resolve;
    });

    const refreshSession = vi.fn(() => refreshPromise);
    const sb = { auth: { refreshSession } } as unknown as SupabaseClient;

    const p1 = runBrowserAuthRefreshDeduped(sb, "test-tab-a");
    const p2 = runBrowserAuthRefreshDeduped(sb, "test-tab-b");

    expect(getAuthRefreshInflightCount()).toBe(1);
    expect(refreshSession).toHaveBeenCalledTimes(1);

    resolveRefresh({ data: { session: null }, error: null });
    await expect(Promise.all([p1, p2])).resolves.toEqual([
      { data: { session: null }, error: null },
      { data: { session: null }, error: null },
    ]);
    expect(getAuthRefreshInflightCount()).toBe(0);
  });

  it("joins 5 concurrent calls into one refreshSession with 1 owner + 4 joined", async () => {
    const infoSpy = vi.spyOn(console, "info").mockImplementation(() => {});
    let resolveRefresh!: (value: { data: { session: null }; error: null }) => void;
    const refreshPromise = new Promise<{ data: { session: null }; error: null }>((resolve) => {
      resolveRefresh = resolve;
    });
    const refreshSession = vi.fn(() => refreshPromise);
    const sb = { auth: { refreshSession } } as unknown as SupabaseClient;

    const calls = Array.from({ length: 5 }, (_, i) =>
      runBrowserAuthRefreshDeduped(sb, `test-caller-${i}`),
    );

    expect(refreshSession).toHaveBeenCalledTimes(1);
    expect(getAuthRefreshInflightCount()).toBe(1);

    const startLogs = infoSpy.mock.calls.filter(([tag]) => tag === "[auth_refresh_start]");
    const joinedFlags = startLogs.map(
      ([, payload]) => (JSON.parse(String(payload)) as { joined_inflight: boolean }).joined_inflight,
    );
    expect(joinedFlags.filter((joined) => joined === false)).toHaveLength(1);
    expect(joinedFlags.filter((joined) => joined === true)).toHaveLength(4);

    resolveRefresh({ data: { session: null }, error: null });
    await Promise.all(calls);
    expect(getAuthRefreshInflightCount()).toBe(0);
  });

  it("clears failed inflight so the next explicit call runs a fresh refresh", async () => {
    vi.spyOn(console, "info").mockImplementation(() => {});
    const refreshSession = vi
      .fn()
      .mockResolvedValueOnce({
        data: { session: null },
        error: { message: "refresh failed", code: "refresh_token_already_used" },
      })
      .mockResolvedValueOnce({ data: { session: null }, error: null });
    const sb = { auth: { refreshSession } } as unknown as SupabaseClient;

    await runBrowserAuthRefreshDeduped(sb, "test-fail-first");
    expect(getAuthRefreshInflightCount()).toBe(0);

    await runBrowserAuthRefreshDeduped(sb, "test-after-fail");
    expect(refreshSession).toHaveBeenCalledTimes(2);
    expect(getAuthRefreshInflightCount()).toBe(0);
  });

  it("skips refresh for recoverable guest unless allowRecoverableGuest is set", async () => {
    vi.spyOn(console, "info").mockImplementation(() => {});
    const refreshSession = vi.fn().mockResolvedValue({ data: { session: null }, error: null });
    const sb = { auth: { refreshSession } } as unknown as SupabaseClient;

    establishRecoverableGuestAuthState("test:boot-race");

    await runBrowserAuthRefreshDeduped(sb, "test-recoverable-default");
    expect(refreshSession).toHaveBeenCalledTimes(0);

    await runBrowserAuthRefreshDeduped(sb, "test-recoverable-allowed", {
      allowRecoverableGuest: true,
    });
    expect(refreshSession).toHaveBeenCalledTimes(1);
  });

  it("blocks refresh for terminal guest even with allowRecoverableGuest", async () => {
    vi.spyOn(console, "info").mockImplementation(() => {});
    const refreshSession = vi.fn().mockResolvedValue({ data: { session: null }, error: null });
    const sb = { auth: { refreshSession } } as unknown as SupabaseClient;

    establishGuestAuthState("test:explicit-logout");

    await runBrowserAuthRefreshDeduped(sb, "test-terminal-guest", {
      allowRecoverableGuest: true,
    });
    expect(refreshSession).toHaveBeenCalledTimes(0);
  });
});
