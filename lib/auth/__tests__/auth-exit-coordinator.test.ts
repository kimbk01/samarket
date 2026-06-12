import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const logoutMock = vi.fn();
const navigateMock = vi.fn();

vi.mock("@/lib/auth/logout", () => ({
  logoutDiBaYAppSession: (...args: unknown[]) => logoutMock(...args),
}));

vi.mock("@/lib/auth/navigate-after-auth-exit", () => ({
  navigateAfterAuthExit: (...args: unknown[]) => navigateMock(...args),
}));

describe("auth-exit-coordinator", () => {
  beforeEach(() => {
    vi.resetModules();
    logoutMock.mockReset();
    navigateMock.mockReset();
    logoutMock.mockResolvedValue({ ok: true });
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("runAuthLogoutExit coalesces duplicate calls", async () => {
    const mod = await import("@/lib/auth/auth-exit-coordinator");
    mod.resetAuthExitNavigateGuard();
    await Promise.all([mod.runAuthLogoutExit(), mod.runAuthLogoutExit()]);
    expect(logoutMock).toHaveBeenCalledTimes(1);
    expect(navigateMock).toHaveBeenCalledTimes(1);
    expect(navigateMock).toHaveBeenCalledWith("logout");
  });

  it("navigateAfterAuthExitOnce ignores second call", async () => {
    const mod = await import("@/lib/auth/auth-exit-coordinator");
    mod.resetAuthExitNavigateGuard();
    mod.navigateAfterAuthExitOnce("session_expired");
    mod.navigateAfterAuthExitOnce("session_expired");
    expect(navigateMock).toHaveBeenCalledTimes(1);
  });
});
