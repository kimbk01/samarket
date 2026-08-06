/**
 * Logout Native Badge durable clear — orchestration + policy contracts.
 * @vitest-environment jsdom
 */
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { resolveNativeBadgeSyncWrite } from "@/lib/push/native/native-badge-sync-policy";
import {
  __resetLogoutBadgeClearTransactionForTests,
  hasPendingLogoutBadgeClearTransaction,
} from "@/lib/push/native/logout-badge-clear-transaction";

const clearNativeBadgeCount = vi.fn();
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
  getDomainBadgeSurfaceAuthEpoch: () => 2,
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

function read(rel: string): string {
  return readFileSync(join(process.cwd(), rel), "utf8");
}

describe("logout native badge durable clear orchestration", () => {
  beforeEach(() => {
    vi.resetModules();
    const map = new Map<string, string>();
    const memory: Storage = {
      get length() {
        return map.size;
      },
      clear: () => map.clear(),
      getItem: (key: string) => map.get(String(key)) ?? null,
      setItem: (key: string, value: string) => {
        map.set(String(key), String(value));
      },
      removeItem: (key: string) => {
        map.delete(String(key));
      },
      key: (index: number) => Array.from(map.keys())[index] ?? null,
    };
    Object.defineProperty(window, "localStorage", {
      value: memory,
      configurable: true,
      writable: true,
    });
    __resetLogoutBadgeClearTransactionForTests();
    clearNativeBadgeCount.mockReset();
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
    vi.spyOn(console, "warn").mockImplementation(() => {});
  });

  afterEach(() => {
    __resetLogoutBadgeClearTransactionForTests();
    vi.restoreAllMocks();
  });

  it("TEST1 — clear resolves before flow returns; navigate caller awaits flow", async () => {
    const order: string[] = [];
    let resolveClear!: (value: unknown) => void;
    clearNativeBadgeCount.mockImplementation(
      () =>
        new Promise((resolve) => {
          order.push("clear:start");
          resolveClear = (value) => {
            order.push("clear:resolve");
            resolve(value);
          };
        }),
    );

    const { runExplicitLogoutFlow } = await import("@/lib/auth/explicit-logout-flow");
    const pending = runExplicitLogoutFlow("current_device").then(() => {
      order.push("flow:return");
    });

    await vi.waitFor(() => {
      expect(order).toContain("clear:start");
    });
    expect(order).not.toContain("flow:return");

    resolveClear({
      attempted: true,
      applied: true,
      supported: true,
      reason: "test",
      startedAt: Date.now(),
      completedAt: Date.now(),
    });
    await pending;
    expect(order).toEqual(["clear:start", "clear:resolve", "flow:return"]);
    expect(hasPendingLogoutBadgeClearTransaction()).toBe(false);

    const coord = read("lib/auth/auth-exit-coordinator.ts");
    const logoutIdx = coord.indexOf("await logoutDiBaYAppSession()");
    const navIdx = coord.indexOf('navigateAfterAuthExitOnce("logout")');
    expect(logoutIdx).toBeGreaterThan(-1);
    expect(navIdx).toBeGreaterThan(logoutIdx);
  });

  it("TEST2 — clear failure keeps pending for recovery", async () => {
    clearNativeBadgeCount.mockResolvedValue({
      attempted: true,
      applied: false,
      supported: null,
      error: "plugin_boom",
      reason: "test",
      startedAt: 1,
      completedAt: 2,
    });

    const { runExplicitLogoutFlow } = await import("@/lib/auth/explicit-logout-flow");
    const result = await runExplicitLogoutFlow("current_device");
    expect(result.localSignOutOk).toBe(true);
    expect(hasPendingLogoutBadgeClearTransaction()).toBe(true);
  });

  it("TEST3 — projection wipe formulas unchanged; hold without pending", () => {
    const wipe = read("lib/auth/client-session-wipe.ts");
    expect(wipe).toContain("resetNotificationBadgeCountForAuthEpoch");
    expect(wipe).toContain("resetDomainBadgeSurfaceForAuthEpoch");
    expect(wipe).not.toContain("clearNativeBadgeCount");
    expect(
      resolveNativeBadgeSyncWrite({
        sessionPhase: "loading",
        projectionState: "EMPTY",
        hasPendingLogoutBadgeClear: false,
      }).kind
    ).toBe("hold");
  });

  it("TEST4 — pending recovers before hold; no pending keeps hold", () => {
    expect(
      resolveNativeBadgeSyncWrite({
        sessionPhase: "recovering",
        projectionState: "EMPTY",
        hasPendingLogoutBadgeClear: true,
      }).kind
    ).toBe("recover_logout_clear");
    expect(
      resolveNativeBadgeSyncWrite({
        sessionPhase: "recovering",
        projectionState: "EMPTY",
        hasPendingLogoutBadgeClear: false,
      }).kind
    ).toBe("hold");
  });

  it("TEST5 — durable owner static", () => {
    const flow = read("lib/auth/explicit-logout-flow.ts");
    const wipe = read("lib/auth/client-session-wipe.ts");
    const native = read("components/push/NativeBadgeSync.tsx");
    const tx = read("lib/push/native/logout-badge-clear-transaction.ts");
    expect(flow).toContain("beginLogoutBadgeClearTransaction");
    expect(flow).toContain("await awaitLogoutNativeBadgeDurableClear");
    expect(flow).toContain("markLogoutBadgeClearTimeout");
    expect(wipe).not.toContain("clearNativeBadgeCount");
    expect(native).toContain("recoverPendingLogoutBadgeClearTransaction");
    expect(tx).toContain("LOGOUT_BADGE_CLEAR_TX_STORAGE_KEY");
  });
});
