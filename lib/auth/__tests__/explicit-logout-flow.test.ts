import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const disconnectNativeDevicesForLogout = vi.fn();
const wipeClientSessionState = vi.fn();
const markExplicitLogoutWipeDone = vi.fn();
const establishGuestAuthState = vi.fn();
const markSessionTerminalGuestFromClient = vi.fn();
const applyImmediateLogoutClientState = vi.fn();
const signOut = vi.fn();

vi.mock("@/lib/auth/client-instance-id", () => ({
  ensureClientInstanceId: () => "device-1",
  getBoundAuthUserId: () => "user-1",
}));

vi.mock("@/lib/push/disconnect-native-devices-for-logout-client", () => ({
  disconnectNativeDevicesForLogout: (...args: unknown[]) => disconnectNativeDevicesForLogout(...args),
}));

vi.mock("@/lib/push/disconnect-web-push-for-logout-client", () => ({
  disconnectWebPushSubscriptionsForLogout: vi.fn(),
}));

vi.mock("@/lib/push/native/sync-native-badge-count", () => ({
  clearNativeBadgeCount: vi.fn(),
}));

vi.mock("@/lib/auth/client-session-wipe", () => ({
  wipeClientSessionState: (...args: unknown[]) => wipeClientSessionState(...args),
  markExplicitLogoutWipeDone: (...args: unknown[]) => markExplicitLogoutWipeDone(...args),
}));

vi.mock("@/lib/auth/guest-auth-state", () => ({
  establishGuestAuthState: (...args: unknown[]) => establishGuestAuthState(...args),
}));

vi.mock("@/lib/auth/dibay-session-manager", () => ({
  markSessionTerminalGuestFromClient: (...args: unknown[]) => markSessionTerminalGuestFromClient(...args),
}));

vi.mock("@/lib/auth/auth-session-immediate.client", () => ({
  applyImmediateLogoutClientState: (...args: unknown[]) => applyImmediateLogoutClientState(...args),
}));

vi.mock("@/lib/supabase/client", () => ({
  getSupabaseClient: () => ({
    auth: {
      signOut: (...args: unknown[]) => signOut(...args),
    },
  }),
}));

vi.mock("@/lib/http/fetch-with-timeout", () => ({
  fetchWithTimeout: vi.fn().mockResolvedValue({
    ok: true,
    json: async () => ({ ok: true }),
  }),
}));

describe("runExplicitLogoutFlow order", () => {
  beforeEach(() => {
    vi.resetModules();
    vi.stubGlobal("window", {} as Window & typeof globalThis);
    disconnectNativeDevicesForLogout.mockReset();
    wipeClientSessionState.mockReset();
    markExplicitLogoutWipeDone.mockReset();
    establishGuestAuthState.mockReset();
    markSessionTerminalGuestFromClient.mockReset();
    applyImmediateLogoutClientState.mockReset();
    signOut.mockReset();
    disconnectNativeDevicesForLogout.mockResolvedValue(undefined);
    wipeClientSessionState.mockResolvedValue(undefined);
    signOut.mockResolvedValue({ error: null });
    vi.spyOn(console, "info").mockImplementation(() => {});
  });

  afterEach(() => {
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
  });

  it("deactivates device before server logout and wipe", async () => {
    const order: string[] = [];
    disconnectNativeDevicesForLogout.mockImplementation(async () => {
      order.push("deactivate");
    });
    wipeClientSessionState.mockImplementation(async () => {
      order.push("wipe");
    });
    signOut.mockImplementation(async () => {
      order.push("signOut");
      return { error: null };
    });

    const { runExplicitLogoutFlow } = await import("@/lib/auth/explicit-logout-flow");
    await runExplicitLogoutFlow("current_device");

    expect(order.indexOf("deactivate")).toBeLessThan(order.indexOf("wipe"));
    expect(order.indexOf("deactivate")).toBeLessThan(order.indexOf("signOut"));
    expect(establishGuestAuthState).toHaveBeenCalled();
    expect(markSessionTerminalGuestFromClient).toHaveBeenCalled();
  });
});
