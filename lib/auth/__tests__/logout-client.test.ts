import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const runExplicitLogoutFlow = vi.fn();

vi.mock("@/lib/auth/explicit-logout-flow", () => ({
  runExplicitLogoutFlow: (...args: unknown[]) => runExplicitLogoutFlow(...args),
}));

describe("logout-client explicit flow", () => {
  beforeEach(() => {
    vi.resetModules();
    vi.stubGlobal("window", {} as Window & typeof globalThis);
    runExplicitLogoutFlow.mockReset();
    runExplicitLogoutFlow.mockResolvedValue({ localSignOutOk: true, serverWarning: null });
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("delegates current device logout to runExplicitLogoutFlow", async () => {
    const mod = await import("@/lib/auth/logout-client");
    const result = await mod.logoutCurrentDevice();
    expect(result.ok).toBe(true);
    expect(runExplicitLogoutFlow).toHaveBeenCalledWith("current_device");
  });
});
