import { describe, expect, it, vi } from "vitest";
import {
  isTerminalCallRecoveryStatus,
  resolveActiveCallRecoveryTarget,
  shouldSkipActiveCallRecoveryRouting,
  ACTIVE_CALL_RECOVERY_DEDUPE_MS,
  ACTIVE_CALL_RECOVERY_LOCK_KEY,
} from "@/lib/community-messenger/call-active-session-recovery";

describe("call-active-session-recovery", () => {
  it("recovers only active direct sessions", () => {
    expect(
      resolveActiveCallRecoveryTarget(
        { id: "s1", status: "active", sessionMode: "direct" },
        "/community-messenger"
      )
    ).toBe("s1");
    expect(resolveActiveCallRecoveryTarget({ id: "s1", status: "ringing" }, "/market")).toBeNull();
    expect(resolveActiveCallRecoveryTarget({ id: "s1", status: "active", sessionMode: "group" }, "/")).toBeNull();
    expect(resolveActiveCallRecoveryTarget({ id: "s1", status: "active" }, "/community-messenger/calls/s1")).toBeNull();
  });

  it("never recovers terminal statuses", () => {
    for (const status of ["ended", "rejected", "missed", "cancelled"]) {
      expect(isTerminalCallRecoveryStatus(status)).toBe(true);
      expect(resolveActiveCallRecoveryTarget({ id: "s1", status }, "/")).toBeNull();
    }
  });

  it("dedupes cross-tab routing within short window", () => {
    const store = new Map<string, string>();
    const sessionStorage = {
      getItem: (k: string) => store.get(k) ?? null,
      setItem: (k: string, v: string) => {
        store.set(k, v);
      },
      removeItem: (k: string) => {
        store.delete(k);
      },
    };
    vi.stubGlobal("sessionStorage", sessionStorage);

    writeLock("sess-a");
    expect(shouldSkipActiveCallRecoveryRouting("sess-a")).toBe(true);
    expect(shouldSkipActiveCallRecoveryRouting("sess-b")).toBe(false);

    const raw = store.get(ACTIVE_CALL_RECOVERY_LOCK_KEY);
    expect(raw).toBeTruthy();
    const parsed = JSON.parse(raw!) as { sessionId: string; at: number };
    parsed.at = Date.now() - ACTIVE_CALL_RECOVERY_DEDUPE_MS - 1;
    store.set(ACTIVE_CALL_RECOVERY_LOCK_KEY, JSON.stringify(parsed));
    expect(shouldSkipActiveCallRecoveryRouting("sess-a")).toBe(false);

    vi.unstubAllGlobals();
  });
});

function writeLock(sessionId: string): void {
  sessionStorage.setItem(
    ACTIVE_CALL_RECOVERY_LOCK_KEY,
    JSON.stringify({ sessionId, at: Date.now() })
  );
}
