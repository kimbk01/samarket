/**
 * Logout badge durable transaction — ROOT FIX contract tests.
 * @vitest-environment jsdom
 */
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { resolveNativeBadgeSyncWrite } from "@/lib/push/native/native-badge-sync-policy";
import {
  LOGOUT_BADGE_CLEAR_TX_STORAGE_KEY,
  __resetLogoutBadgeClearTransactionForTests,
  __writeLogoutBadgeClearTransactionForTests,
  beginLogoutBadgeClearTransaction,
  countPendingLogoutBadgeClearTransactions,
  executeLogoutBadgeClearTransaction,
  getPendingLogoutBadgeClearTransaction,
  hasPendingLogoutBadgeClearTransaction,
  markLogoutBadgeClearTimeout,
  readLogoutBadgeClearTransaction,
  recoverPendingLogoutBadgeClearTransaction,
  type LogoutBadgeClearTransaction,
} from "@/lib/push/native/logout-badge-clear-transaction";

const clearNativeBadgeCount = vi.fn();

vi.mock("@/lib/push/native/sync-native-badge-count", () => ({
  clearNativeBadgeCount: (...args: unknown[]) => clearNativeBadgeCount(...args),
  syncNativeBadgeCount: vi.fn(),
}));

vi.mock("@/lib/platform/capacitor-native", () => ({
  isCapacitorNativePlatform: () => mockIsNative(),
}));

vi.mock("@/lib/messenger/contracts/domain-badge-surface-store", () => ({
  getDomainBadgeSurfaceAuthEpoch: () => mockAuthEpoch,
}));

let mockIsNative = () => true;
let mockAuthEpoch = 7;
let mockBadgeGet = 0;

vi.mock("@capawesome/capacitor-badge", () => ({
  Badge: {
    get: async () => ({ count: mockBadgeGet }),
    clear: async () => undefined,
    set: async () => undefined,
    isSupported: async () => ({ isSupported: true }),
  },
}));

function read(rel: string): string {
  return readFileSync(join(process.cwd(), rel), "utf8");
}

function pendingFixture(
  overrides?: Partial<LogoutBadgeClearTransaction>
): LogoutBadgeClearTransaction {
  return {
    transactionId: "tx-a",
    authEpoch: 7,
    previousViewerId: "user-a",
    targetCount: 0,
    status: "pending",
    createdAt: 1000,
    attempt: 0,
    lastError: null,
    revision: 1,
    reason: "test",
    completedAt: null,
    ...overrides,
  };
}

function installMemoryLocalStorage(): void {
  const map = new Map<string, string>();
  const memory: Storage = {
    get length() {
      return map.size;
    },
    clear: () => {
      map.clear();
    },
    getItem: (key: string) => map.get(String(key)) ?? null,
    setItem: (key: string, value: string) => {
      map.set(String(key), String(value));
    },
    removeItem: (key: string) => {
      map.delete(String(key));
    },
    key: (index: number) => Array.from(map.keys())[index] ?? null,
  };
  Object.defineProperty(globalThis, "localStorage", {
    value: memory,
    configurable: true,
    writable: true,
  });
  if (typeof window !== "undefined") {
    Object.defineProperty(window, "localStorage", {
      value: memory,
      configurable: true,
      writable: true,
    });
  }
}

describe("logout badge clear durable transaction", () => {
  beforeEach(() => {
    installMemoryLocalStorage();
    mockIsNative = () => true;
    mockAuthEpoch = 7;
    mockBadgeGet = 0;
    clearNativeBadgeCount.mockReset();
    clearNativeBadgeCount.mockResolvedValue({
      attempted: true,
      applied: true,
      supported: true,
      reason: "test",
      startedAt: 1,
      completedAt: 2,
    });
    __resetLogoutBadgeClearTransactionForTests();
    vi.spyOn(console, "log").mockImplementation(() => {});
    vi.spyOn(console, "warn").mockImplementation(() => {});
  });

  afterEach(() => {
    __resetLogoutBadgeClearTransactionForTests();
    vi.restoreAllMocks();
  });

  it("TEST1 — normal logout: pending → clear → get0 → completed", async () => {
    const begun = beginLogoutBadgeClearTransaction({
      previousViewerId: "user-a",
      reason: "explicit_logout:current_device",
    });
    expect(begun.ok).toBe(true);
    if (!begun.ok) return;
    expect(hasPendingLogoutBadgeClearTransaction()).toBe(true);
    const result = await executeLogoutBadgeClearTransaction(begun.tx.transactionId);
    expect(result.outcome).toBe("completed");
    expect(result.badgeGet).toBe(0);
    expect(hasPendingLogoutBadgeClearTransaction()).toBe(false);
    expect(countPendingLogoutBadgeClearTransactions()).toBe(0);
  });

  it("TEST2 — interruption: reload finds pending and recovers", async () => {
    const begun = beginLogoutBadgeClearTransaction({
      previousViewerId: "user-a",
      reason: "logout",
    });
    expect(begun.ok).toBe(true);
    if (!begun.ok) return;
    // Simulate WebView kill before execute: only durable storage remains.
    const raw = window.localStorage.getItem(LOGOUT_BADGE_CLEAR_TX_STORAGE_KEY);
    expect(raw).toBeTruthy();
    // Process restart simulation: clear in-memory by re-reading only storage.
    const recovered = await recoverPendingLogoutBadgeClearTransaction();
    expect(recovered?.outcome).toBe("completed");
    expect(hasPendingLogoutBadgeClearTransaction()).toBe(false);
  });

  it("TEST3 — timeout keeps pending; boot recovery completes", async () => {
    const begun = beginLogoutBadgeClearTransaction({
      previousViewerId: "user-a",
      reason: "logout",
    });
    expect(begun.ok).toBe(true);
    if (!begun.ok) return;
    markLogoutBadgeClearTimeout(begun.tx.transactionId, "execute_timeout");
    const pending = getPendingLogoutBadgeClearTransaction();
    expect(pending?.status).toBe("pending");
    expect(pending?.lastError).toBe("execute_timeout");
    const recovered = await recoverPendingLogoutBadgeClearTransaction();
    expect(recovered?.outcome).toBe("completed");
    expect(countPendingLogoutBadgeClearTransactions()).toBe(0);
  });

  it("TEST4 — native rejection keeps pending; retry succeeds", async () => {
    const begun = beginLogoutBadgeClearTransaction({
      previousViewerId: "user-a",
      reason: "logout",
    });
    expect(begun.ok).toBe(true);
    if (!begun.ok) return;
    clearNativeBadgeCount.mockResolvedValueOnce({
      attempted: true,
      applied: false,
      supported: null,
      error: "plugin_boom",
      reason: "test",
      startedAt: 1,
      completedAt: 2,
    });
    const first = await executeLogoutBadgeClearTransaction(begun.tx.transactionId);
    expect(first.outcome).toBe("pending_retry");
    expect(hasPendingLogoutBadgeClearTransaction()).toBe(true);

    clearNativeBadgeCount.mockResolvedValueOnce({
      attempted: true,
      applied: true,
      supported: true,
      reason: "test",
      startedAt: 3,
      completedAt: 4,
    });
    mockBadgeGet = 0;
    const second = await executeLogoutBadgeClearTransaction(begun.tx.transactionId);
    expect(second.outcome).toBe("completed");
    expect(hasPendingLogoutBadgeClearTransaction()).toBe(false);
  });

  it("TEST5 — no pending → no recovery clear (no global guest patch)", async () => {
    expect(await recoverPendingLogoutBadgeClearTransaction()).toBeNull();
    expect(clearNativeBadgeCount).not.toHaveBeenCalled();
  });

  it("TEST6 — loading/recovering hold preserved without pending", () => {
    for (const phase of ["loading", "recovering", "corrupt"] as const) {
      expect(
        resolveNativeBadgeSyncWrite({
          sessionPhase: phase,
          projectionState: "EMPTY",
          hasPendingLogoutBadgeClear: false,
        }).kind
      ).toBe("hold");
    }
  });

  it("TEST6b — pending overrides hold", () => {
    expect(
      resolveNativeBadgeSyncWrite({
        sessionPhase: "loading",
        projectionState: "EMPTY",
        hasPendingLogoutBadgeClear: true,
      })
    ).toEqual({ kind: "recover_logout_clear", reason: "pending_logout_clear_tx" });
  });

  it("TEST7 — pending blocks N repaint (static gate in syncNativeBadgeCount)", () => {
    const syncSrc = read("lib/push/native/sync-native-badge-count.ts");
    expect(syncSrc).toContain("blocked_pending_logout_clear");
    expect(syncSrc).toContain("hasPendingLogoutBadgeClearTransaction");
    expect(syncSrc).toMatch(/if \(value > 0\)/);
  });

  it("TEST8 — account isolation: stale completion does not apply after supersede", async () => {
    const t1 = beginLogoutBadgeClearTransaction({
      previousViewerId: "user-a",
      reason: "logout_a",
    });
    expect(t1.ok).toBe(true);
    if (!t1.ok) return;
    const t1Id = t1.tx.transactionId;

    const t2 = beginLogoutBadgeClearTransaction({
      previousViewerId: "user-a",
      reason: "logout_a_again",
    });
    expect(t2.ok).toBe(true);
    if (!t2.ok) return;
    expect(t2.tx.transactionId).not.toBe(t1Id);
    expect(getPendingLogoutBadgeClearTransaction()?.transactionId).toBe(t2.tx.transactionId);

    const stale = await executeLogoutBadgeClearTransaction(t1Id);
    expect(stale.outcome).toBe("stale_or_missing");
    expect(hasPendingLogoutBadgeClearTransaction()).toBe(true);

    const fresh = await executeLogoutBadgeClearTransaction(t2.tx.transactionId);
    expect(fresh.outcome).toBe("completed");
  });

  it("TEST9 — multiple logout transactions: newer revision is authority", () => {
    const t1 = beginLogoutBadgeClearTransaction({ previousViewerId: "a", reason: "t1" });
    const t2 = beginLogoutBadgeClearTransaction({ previousViewerId: "a", reason: "t2" });
    expect(t1.ok && t2.ok).toBe(true);
    if (!t1.ok || !t2.ok) return;
    expect(t2.tx.revision).toBeGreaterThan(t1.tx.revision);
    expect(readLogoutBadgeClearTransaction()?.transactionId).toBe(t2.tx.transactionId);
  });

  it("TEST10 — process restart: durable intent alone enables recovery", async () => {
    const tx = pendingFixture({ transactionId: "tx-restart" });
    expect(__writeLogoutBadgeClearTransactionForTests(tx)).toBe(true);
    // No in-memory owner state beyond storage — recover from key only.
    expect(hasPendingLogoutBadgeClearTransaction()).toBe(true);
    const result = await recoverPendingLogoutBadgeClearTransaction();
    expect(result?.outcome).toBe("completed");
    expect(window.localStorage.getItem(LOGOUT_BADGE_CLEAR_TX_STORAGE_KEY)).toBeNull();
  });

  it("TEST11 — storage failure is not treated as completed logout clear", () => {
    const setItem = vi.spyOn(window.localStorage, "setItem").mockImplementation(() => {
      throw new Error("quota");
    });
    try {
      const begun = beginLogoutBadgeClearTransaction({
        previousViewerId: "a",
        reason: "logout",
      });
      expect(begun.ok).toBe(false);
      if (begun.ok) return;
      expect(begun.reason).toBe("storage_failed");
      expect(hasPendingLogoutBadgeClearTransaction()).toBe(false);
    } finally {
      setItem.mockRestore();
    }
  });

  it("TEST12 — formula / hold / wipe regression static", () => {
    const wipe = read("lib/auth/client-session-wipe.ts");
    expect(wipe).toContain("resetNotificationBadgeCountForAuthEpoch");
    expect(wipe).toContain("resetDomainBadgeSurfaceForAuthEpoch");
    expect(wipe).not.toContain("clearNativeBadgeCount");
    const policy = read("lib/push/native/native-badge-sync-policy.ts");
    expect(policy).toContain("recover_logout_clear");
    expect(policy).toContain("session_transient");
    const flow = read("lib/auth/explicit-logout-flow.ts");
    expect(flow).toContain("beginLogoutBadgeClearTransaction");
    expect(flow).toContain("markLogoutBadgeClearTimeout");
    expect(flow).toContain("pendingKept");
    const session = read("lib/auth/dibay-session-policy.ts");
    expect(session).toContain("dibay:logout_badge_clear_tx");
  });

  it("web_no_native_badge completes without pending", async () => {
    mockIsNative = () => false;
    const begun = beginLogoutBadgeClearTransaction({
      previousViewerId: null,
      reason: "logout",
    });
    expect(begun.ok).toBe(true);
    if (!begun.ok) return;
    const result = await executeLogoutBadgeClearTransaction(begun.tx.transactionId);
    expect(result.outcome).toBe("web_no_native_badge");
    expect(hasPendingLogoutBadgeClearTransaction()).toBe(false);
  });

  it("badge_get nonzero keeps pending", async () => {
    mockBadgeGet = 33;
    const begun = beginLogoutBadgeClearTransaction({
      previousViewerId: "a",
      reason: "logout",
    });
    expect(begun.ok).toBe(true);
    if (!begun.ok) return;
    const result = await executeLogoutBadgeClearTransaction(begun.tx.transactionId);
    expect(result.outcome).toBe("pending_retry");
    expect(result.error).toContain("badge_get_nonzero:33");
    expect(hasPendingLogoutBadgeClearTransaction()).toBe(true);
  });
});
