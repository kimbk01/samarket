import { afterEach, describe, expect, it, vi } from "vitest";
import {
  getAuthRefreshInflightCount,
  resetAuthRefreshTelemetryForTests,
  runBrowserAuthRefreshDeduped,
} from "@/lib/supabase/auth-refresh-telemetry";
import type { SupabaseClient } from "@supabase/supabase-js";

describe("runBrowserAuthRefreshDeduped", () => {
  afterEach(() => {
    resetAuthRefreshTelemetryForTests();
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
});
