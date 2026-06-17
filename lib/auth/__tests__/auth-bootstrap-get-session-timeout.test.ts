import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  awaitAuthBootstrapInitialSession,
  isAuthBootstrapInitialSessionDone,
  peekAuthBootstrapInitialSessionHasSession,
  resetAuthBootstrapStateForTests,
} from "@/lib/auth/auth-bootstrap-state";

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

vi.mock("@/lib/auth/await-client-supabase-session-ready", () => ({
  awaitClientSupabaseSessionReady: vi.fn(async () => undefined),
}));

describe("auth bootstrap getSession timeout", () => {
  beforeEach(() => {
    resetAuthBootstrapStateForTests();
    vi.stubGlobal("window", { setTimeout: globalThis.setTimeout, clearTimeout: globalThis.clearTimeout });
    getSession.mockReset();
    onAuthStateChange.mockReset();
    vi.spyOn(console, "info").mockImplementation(() => {});
    vi.useFakeTimers();
  });

  afterEach(() => {
    resetAuthBootstrapStateForTests();
    vi.unstubAllGlobals();
    vi.useRealTimers();
    vi.restoreAllMocks();
  });

  it("marks bootstrap done without session when getSession hangs", async () => {
    getSession.mockImplementation(() => new Promise(() => undefined));

    const pending = awaitAuthBootstrapInitialSession();
    await vi.advanceTimersByTimeAsync(2_500);
    await pending;

    expect(isAuthBootstrapInitialSessionDone()).toBe(true);
    expect(peekAuthBootstrapInitialSessionHasSession()).toBe(false);
  });
});
