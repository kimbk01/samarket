import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const disconnectNativeDevicesForLogout = vi.fn();
const wipeClientSessionState = vi.fn();
const markExplicitLogoutWipeDone = vi.fn();
const establishGuestAuthState = vi.fn();
const markSessionTerminalGuestFromClient = vi.fn();
const applyImmediateLogoutClientState = vi.fn();
const signOut = vi.fn();
const clearNativeBadgeCount = vi.fn();

vi.mock("@/lib/auth/client-instance-id", () => ({
  ensureClientInstanceId: () => "device-1",
  getBoundAuthUserId: () => "user-1",
}));

vi.mock("@/lib/push/disconnect-native-devices-for-logout-client", () => ({
  disconnectNativeDevicesForLogout: (...args: unknown[]) => disconnectNativeDevicesForLogout(...args),
}));

vi.mock("@/lib/auth/apply-local-logout-fail-closed", () => ({
  applyLocalLogoutFailClosed: vi.fn(async () => undefined),
}));

vi.mock("@/lib/push/native/clear-all-delivered-notifications-for-logout", () => ({
  clearAllDeliveredNotificationsForLogout: vi.fn(async () => undefined),
}));

vi.mock("@/lib/push/disconnect-web-push-for-logout-client", () => ({
  disconnectWebPushSubscriptionsForLogout: vi.fn(),
}));

vi.mock("@/lib/push/native/sync-native-badge-count", () => ({
  clearNativeBadgeCount: (...args: unknown[]) => clearNativeBadgeCount(...args),
}));

vi.mock("@/lib/platform/capacitor-native", () => ({
  isCapacitorNativePlatform: () => true,
}));

vi.mock("@capawesome/capacitor-badge", () => ({
  Badge: {
    get: async () => ({ count: 0 }),
    clear: async () => undefined,
    set: async () => undefined,
    isSupported: async () => ({ isSupported: true }),
  },
}));

vi.mock("@/lib/messenger/contracts/domain-badge-surface-store", () => ({
  getDomainBadgeSurfaceAuthEpoch: () => 3,
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
    vi.stubGlobal("window", {
      localStorage: (() => {
        const map = new Map<string, string>();
        return {
          getItem: (k: string) => map.get(k) ?? null,
          setItem: (k: string, v: string) => {
            map.set(k, v);
          },
          removeItem: (k: string) => {
            map.delete(k);
          },
        };
      })(),
    } as unknown as Window & typeof globalThis);
    disconnectNativeDevicesForLogout.mockReset();
    wipeClientSessionState.mockReset();
    markExplicitLogoutWipeDone.mockReset();
    establishGuestAuthState.mockReset();
    markSessionTerminalGuestFromClient.mockReset();
    applyImmediateLogoutClientState.mockReset();
    signOut.mockReset();
    clearNativeBadgeCount.mockReset();
    disconnectNativeDevicesForLogout.mockResolvedValue({ ok: true, mode: "authenticated" });
    wipeClientSessionState.mockResolvedValue(undefined);
    signOut.mockResolvedValue({ error: null });
    clearNativeBadgeCount.mockResolvedValue({
      attempted: true,
      applied: true,
      supported: true,
      reason: "test",
      startedAt: Date.now(),
      completedAt: Date.now(),
    });
    vi.spyOn(console, "info").mockImplementation(() => {});
    vi.spyOn(console, "log").mockImplementation(() => {});
  });

  afterEach(() => {
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
  });

  it("deactivates device before wipe; durable clear runs after terminal_guest", async () => {
    const order: string[] = [];
    disconnectNativeDevicesForLogout.mockImplementation(async () => {
      order.push("deactivate");
      return { ok: true, mode: "authenticated" };
    });
    wipeClientSessionState.mockImplementation(async () => {
      order.push("wipe");
    });
    signOut.mockImplementation(async () => {
      order.push("signOut");
      return { error: null };
    });
    clearNativeBadgeCount.mockImplementation(async () => {
      order.push("nativeClear");
      return {
        attempted: true,
        applied: true,
        supported: true,
        reason: "test",
        startedAt: Date.now(),
        completedAt: Date.now(),
      };
    });

    const { runExplicitLogoutFlow } = await import("@/lib/auth/explicit-logout-flow");
    await runExplicitLogoutFlow("current_device");

    expect(order.indexOf("deactivate")).toBeLessThan(order.indexOf("wipe"));
    expect(order.indexOf("deactivate")).toBeLessThan(order.indexOf("signOut"));
    expect(order.indexOf("wipe")).toBeLessThan(order.indexOf("nativeClear"));
    expect(establishGuestAuthState).toHaveBeenCalled();
    expect(markSessionTerminalGuestFromClient).toHaveBeenCalled();
    expect(clearNativeBadgeCount).toHaveBeenCalled();
    expect(String(clearNativeBadgeCount.mock.calls[0]?.[0]?.reason ?? "")).toMatch(
      /logout_badge_clear_tx:/
    );
  });
});
