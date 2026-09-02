import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  clearPendingPushRoute,
  consumePendingPushRoute,
  PENDING_PUSH_ROUTE_STORAGE_KEY,
  PENDING_PUSH_ROUTE_TTL_MS,
  readPendingPushRoute,
  writePendingPushRoute,
} from "@/lib/push/pending-push-route";

function createSessionStorageMock(): Storage {
  const store = new Map<string, string>();
  return {
    get length() {
      return store.size;
    },
    clear() {
      store.clear();
    },
    getItem(key: string) {
      return store.get(key) ?? null;
    },
    key(index: number) {
      return [...store.keys()][index] ?? null;
    },
    removeItem(key: string) {
      store.delete(key);
    },
    setItem(key: string, value: string) {
      store.set(key, value);
    },
  };
}

describe("pending-push-route", () => {
  beforeEach(() => {
    const storage = createSessionStorageMock();
    vi.stubGlobal("sessionStorage", storage);
    vi.stubGlobal("window", { sessionStorage: storage });
  });

  afterEach(() => {
    clearPendingPushRoute();
    vi.unstubAllGlobals();
  });

  it("round-trips path and notificationId", () => {
    writePendingPushRoute({
      path: "/community-messenger/calls/sess-1?action=accept",
      notificationId: "n-1",
      at: Date.now(),
    });
    const pending = readPendingPushRoute();
    expect(pending?.path).toBe("/community-messenger/calls/sess-1?action=accept");
    expect(pending?.notificationId).toBe("n-1");
  });

  it("expires stale pending routes", () => {
    const now = 1_000_000;
    vi.spyOn(Date, "now").mockReturnValue(now);
    sessionStorage.setItem(
      PENDING_PUSH_ROUTE_STORAGE_KEY,
      JSON.stringify({
        path: "/community-messenger/calls/old",
        at: now - PENDING_PUSH_ROUTE_TTL_MS - 1,
      }),
    );
    expect(readPendingPushRoute(now)).toBeNull();
    expect(sessionStorage.getItem(PENDING_PUSH_ROUTE_STORAGE_KEY)).toBeNull();
  });

  it("clearPendingPushRoute removes storage", () => {
    writePendingPushRoute({ path: "/mypage", at: Date.now() });
    clearPendingPushRoute();
    expect(readPendingPushRoute()).toBeNull();
  });

  it("consumePendingPushRoute reads once", () => {
    writePendingPushRoute({
      path: "/notifications?tab=system",
      notificationId: "n-1",
      source: "envelope",
      at: Date.now(),
    });
    const first = consumePendingPushRoute();
    expect(first?.path).toBe("/notifications?tab=system");
    expect(consumePendingPushRoute()).toBeNull();
  });

  it("round-trips support_modal kind and caseId", () => {
    writePendingPushRoute({
      path: "/support/cases/case-1",
      kind: "support_modal",
      caseId: "case-1",
      notificationId: "n-support",
      at: Date.now(),
    });
    const pending = readPendingPushRoute();
    expect(pending?.kind).toBe("support_modal");
    expect(pending?.caseId).toBe("case-1");
    expect(pending?.notificationId).toBe("n-support");
  });

  it("rejects pending payloads that include title/body", () => {
    sessionStorage.setItem(
      PENDING_PUSH_ROUTE_STORAGE_KEY,
      JSON.stringify({
        path: "/notifications",
        title: "secret",
        body: "nope",
        at: Date.now(),
      })
    );
    expect(readPendingPushRoute()).toBeNull();
  });
});
