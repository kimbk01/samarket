import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const wipeMock = vi.fn();
const markExplicitMock = vi.fn();
const applyImmediateMock = vi.fn();
const signOutMock = vi.fn();
const fetchWithTimeoutMock = vi.fn();

vi.mock("@/lib/auth/auth-session-immediate.client", () => ({
  applyImmediateLogoutClientState: () => applyImmediateMock(),
}));

vi.mock("@/lib/auth/client-session-wipe", () => ({
  wipeClientSessionState: (...args: unknown[]) => wipeMock(...args),
  markExplicitLogoutWipeDone: () => markExplicitMock(),
}));

vi.mock("@/lib/supabase/client", () => ({
  getSupabaseClient: () => ({
    auth: {
      signOut: (...args: unknown[]) => signOutMock(...args),
    },
  }),
}));

vi.mock("@/lib/http/fetch-with-timeout", () => ({
  fetchWithTimeout: (...args: unknown[]) => fetchWithTimeoutMock(...args),
}));

describe("logout-client", () => {
  beforeEach(() => {
    vi.resetModules();
    vi.stubGlobal("window", {} as Window & typeof globalThis);
    wipeMock.mockReset();
    markExplicitMock.mockReset();
    applyImmediateMock.mockReset();
    signOutMock.mockReset();
    fetchWithTimeoutMock.mockReset();
    wipeMock.mockResolvedValue(undefined);
    signOutMock.mockResolvedValue({ error: null });
    fetchWithTimeoutMock.mockResolvedValue({
      ok: true,
      json: async () => ({ ok: true }),
    });
    vi.spyOn(console, "info").mockImplementation(() => {});
    vi.spyOn(console, "error").mockImplementation(() => {});
  });

  afterEach(() => {
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
  });

  it("applies guest UI immediately, awaits local signOut, then schedules wipe/server in background", async () => {
    const order: string[] = [];
    applyImmediateMock.mockImplementation(() => {
      order.push("immediate");
    });
    signOutMock.mockImplementation(async () => {
      order.push("signOut");
      return { error: null };
    });
    wipeMock.mockImplementation(async () => {
      order.push("wipe");
    });
    fetchWithTimeoutMock.mockImplementation(async () => {
      order.push("server");
      return { ok: true, json: async () => ({ ok: true }) };
    });

    const mod = await import("@/lib/auth/logout-client");
    const result = await mod.logoutCurrentDevice();

    expect(result.ok).toBe(true);
    expect(order.slice(0, 2)).toEqual(["immediate", "signOut"]);
    expect(markExplicitMock).toHaveBeenCalledTimes(1);
    expect(applyImmediateMock).toHaveBeenCalledTimes(1);

    await vi.waitFor(() => {
      expect(order).toEqual(["immediate", "signOut", "wipe", "server"]);
    });
  });

  it("calls local signOut once (foreground await, background skip duplicate)", async () => {
    const mod = await import("@/lib/auth/logout-client");
    await mod.logoutCurrentDevice();
    await vi.waitFor(() => {
      expect(wipeMock).toHaveBeenCalledWith("user_logout");
    });
    expect(signOutMock).toHaveBeenCalledTimes(1);
    expect(signOutMock).toHaveBeenCalledWith({ scope: "local" });
  });

  it("still schedules background cleanup when local signOut fails", async () => {
    signOutMock.mockRejectedValue(new Error("signout_fail"));

    const mod = await import("@/lib/auth/logout-client");
    const result = await mod.logoutCurrentDevice();

    expect(result.ok).toBe(true);
    expect(applyImmediateMock).toHaveBeenCalledTimes(1);
    expect(signOutMock).toHaveBeenCalledTimes(1);
    await vi.waitFor(() => {
      expect(wipeMock).toHaveBeenCalledWith("user_logout");
    });
  });
});
