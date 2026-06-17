import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const getSession = vi.fn();
const onAuthStateChange = vi.fn();

vi.mock("@/lib/supabase/client", () => ({
  getSupabaseClient: () => ({
    auth: {
      getSession,
      onAuthStateChange,
    },
  }),
}));

describe("awaitClientSupabaseSessionReady", () => {
  beforeEach(() => {
    vi.resetModules();
    vi.stubGlobal("window", { setTimeout: globalThis.setTimeout, clearTimeout: globalThis.clearTimeout });
    getSession.mockReset();
    onAuthStateChange.mockReset();
    getSession.mockResolvedValue({ data: { session: null } });
  });

  afterEach(() => {
    vi.unstubAllGlobals();
    vi.useRealTimers();
  });

  it("resolves immediately on INITIAL_SESSION without user", async () => {
    onAuthStateChange.mockImplementation((handler: (event: string, session: null) => void) => {
      queueMicrotask(() => handler("INITIAL_SESSION", null));
      return { data: { subscription: { unsubscribe: vi.fn() } } };
    });

    const { awaitClientSupabaseSessionReady } = await import(
      "@/lib/auth/await-client-supabase-session-ready"
    );
    const t0 = Date.now();
    await awaitClientSupabaseSessionReady(5_000);
    expect(Date.now() - t0).toBeLessThan(500);
  });
});
