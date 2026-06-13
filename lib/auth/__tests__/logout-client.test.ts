import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const wipeMock = vi.fn();
const markExplicitMock = vi.fn();
const signOutMock = vi.fn();
const fetchWithTimeoutMock = vi.fn();

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
    signOutMock.mockReset();
    fetchWithTimeoutMock.mockReset();
    wipeMock.mockResolvedValue(undefined);
    signOutMock.mockResolvedValue({ error: null });
    fetchWithTimeoutMock.mockResolvedValue({
      ok: true,
      json: async () => ({ ok: true }),
    });
    vi.spyOn(console, "info").mockImplementation(() => {});
  });

  afterEach(() => {
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
  });

  it("awaits server logout after local wipe and signOut", async () => {
    const order: string[] = [];
    wipeMock.mockImplementation(async () => {
      order.push("wipe");
    });
    signOutMock.mockImplementation(async () => {
      order.push("signOut");
      return { error: null };
    });
    fetchWithTimeoutMock.mockImplementation(async () => {
      order.push("server");
      return { ok: true, json: async () => ({ ok: true }) };
    });

    const mod = await import("@/lib/auth/logout-client");
    const result = await mod.logoutCurrentDevice();

    expect(result.ok).toBe(true);
    expect(order).toEqual(["wipe", "signOut", "server"]);
    expect(fetchWithTimeoutMock).toHaveBeenCalledWith("/api/auth/logout", expect.objectContaining({ method: "POST" }));
  });

  it("still wipes when local signOut fails", async () => {
    signOutMock.mockRejectedValue(new Error("signout_fail"));
    fetchWithTimeoutMock.mockResolvedValue({
      ok: true,
      json: async () => ({ ok: true }),
    });

    const mod = await import("@/lib/auth/logout-client");
    const result = await mod.logoutCurrentDevice();

    expect(result.ok).toBe(true);
    expect(wipeMock).toHaveBeenCalledWith("user_logout");
    expect(fetchWithTimeoutMock).toHaveBeenCalled();
  });
});
