import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const logoutCurrentMock = vi.fn();
const forceClearMock = vi.fn();
const navigateMock = vi.fn();

vi.mock("@/lib/auth/logout", () => ({
  logoutDiBaYAppSession: (...args: unknown[]) => logoutCurrentMock(...args),
  forceClearDiBaYCorruptSession: (...args: unknown[]) => forceClearMock(...args),
}));

vi.mock("@/lib/auth/navigate-after-auth-exit", () => ({
  navigateAfterAuthExit: (...args: unknown[]) => navigateMock(...args),
}));

describe("auth-exit-coordinator", () => {
  beforeEach(() => {
    vi.resetModules();
    logoutCurrentMock.mockReset();
    forceClearMock.mockReset();
    navigateMock.mockReset();
    logoutCurrentMock.mockResolvedValue({ ok: true });
    forceClearMock.mockResolvedValue({ ok: true });
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("runAuthLogoutExit coalesces duplicate calls", async () => {
    const mod = await import("@/lib/auth/auth-exit-coordinator");
    mod.resetAuthExitNavigateGuard();
    await Promise.all([mod.runAuthLogoutExit(), mod.runAuthLogoutExit()]);
    expect(logoutCurrentMock).toHaveBeenCalledTimes(1);
    expect(navigateMock).toHaveBeenCalledTimes(1);
    expect(navigateMock).toHaveBeenCalledWith("logout");
  });

  it("runAuthSessionExpiredExit uses forceClearCorruptSession", async () => {
    const mod = await import("@/lib/auth/auth-exit-coordinator");
    mod.resetAuthExitNavigateGuard();
    await mod.runAuthSessionExpiredExit();
    expect(forceClearMock).toHaveBeenCalledTimes(1);
    expect(logoutCurrentMock).not.toHaveBeenCalled();
    expect(navigateMock).toHaveBeenCalledWith("session_expired");
  });

  it("navigateAfterAuthExitOnce ignores second call", async () => {
    const mod = await import("@/lib/auth/auth-exit-coordinator");
    mod.resetAuthExitNavigateGuard();
    mod.navigateAfterAuthExitOnce("session_expired");
    mod.navigateAfterAuthExitOnce("session_expired");
    expect(navigateMock).toHaveBeenCalledTimes(1);
  });
});
