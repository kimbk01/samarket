import { describe, expect, it } from "vitest";
import {
  clearNativeCalleeAcceptPending,
  isNativeCalleeAcceptRoute,
  markNativeCalleeAcceptPending,
  readNativeCalleeAcceptPendingSessionId,
  shouldDeferCalleeGenericAutoJoin,
  shouldSuppressCalleeIncomingRingingUi,
} from "@/lib/community-messenger/native-callee-accept-entry";

function installMemorySessionStorage() {
  const store = new Map<string, string>();
  const api: Storage = {
    getItem: (key: string) => store.get(key) ?? null,
    setItem: (key: string, value: string) => {
      store.set(String(key), String(value));
    },
    removeItem: (key: string) => {
      store.delete(key);
    },
    clear: () => {
      store.clear();
    },
    key: (index: number) => [...store.keys()][index] ?? null,
    get length() {
      return store.size;
    },
  } as unknown as Storage;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  (globalThis as any).sessionStorage = api;
  return () => {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    delete (globalThis as any).sessionStorage;
  };
}

describe("native-callee-accept-entry", () => {
  const cleanup = installMemorySessionStorage();

  it("detects native accept route", () => {
    expect(isNativeCalleeAcceptRoute({ action: "accept", nativeAccept: "1" })).toBe(true);
    expect(isNativeCalleeAcceptRoute({ action: "accept", nativeAccept: null })).toBe(false);
  });

  it("tracks native accept pending before route params hydrate", () => {
    markNativeCalleeAcceptPending("sess-pending");
    expect(readNativeCalleeAcceptPendingSessionId()).toBe("sess-pending");
    expect(
      shouldSuppressCalleeIncomingRingingUi({
        isCallee: true,
        joined: false,
        acceptRoute: { action: null, nativeAccept: null },
        busyAcceptOrJoin: false,
        sessionId: "sess-pending",
      })
    ).toBe(true);
    clearNativeCalleeAcceptPending("sess-pending");
    expect(readNativeCalleeAcceptPendingSessionId()).toBeNull();
  });

  it("suppresses ringing UI for accept route until joined", () => {
    expect(
      shouldSuppressCalleeIncomingRingingUi({
        isCallee: true,
        joined: false,
        acceptRoute: { action: "accept", nativeAccept: "1" },
        busyAcceptOrJoin: false,
      })
    ).toBe(true);
    expect(
      shouldSuppressCalleeIncomingRingingUi({
        isCallee: true,
        joined: true,
        acceptRoute: { action: "accept", nativeAccept: "1" },
        busyAcceptOrJoin: false,
      })
    ).toBe(false);
  });

  it("defers generic auto-join while accept route is active", () => {
    expect(
      shouldDeferCalleeGenericAutoJoin({
        isCallee: true,
        joined: false,
        joining: false,
        acceptRoute: { action: "accept", nativeAccept: "1" },
        busyAcceptOrJoin: false,
        sessionId: "sess-1",
      })
    ).toBe(true);
    markNativeCalleeAcceptPending("sess-2");
    expect(
      shouldDeferCalleeGenericAutoJoin({
        isCallee: true,
        joined: false,
        joining: false,
        acceptRoute: { action: null, nativeAccept: null },
        busyAcceptOrJoin: false,
        sessionId: "sess-2",
      })
    ).toBe(true);
    clearNativeCalleeAcceptPending("sess-2");
    expect(
      shouldDeferCalleeGenericAutoJoin({
        isCallee: true,
        joined: false,
        joining: false,
        acceptRoute: { action: null, nativeAccept: null },
        busyAcceptOrJoin: false,
      })
    ).toBe(false);
  });

  it("cleans up test sessionStorage", () => {
    cleanup();
    expect(true).toBe(true);
  });
});
