import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const ackNativePushRouteConsumed = vi.fn(async (_opts: { path: string }) => {});
vi.mock("@/lib/push/native/push-route-native-bridge", () => ({
  ackNativePushRouteConsumed: (opts: { path: string }) => ackNativePushRouteConsumed(opts),
}));

import { redirectResourceAccessDenied } from "@/lib/auth/resource-access-denied-flow";
import { readPendingPushRoute, writePendingPushRoute } from "@/lib/push/pending-push-route";

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

const ROOM = "/community-messenger/rooms/room-left-1";

describe("redirectResourceAccessDenied (2026-11-02 F-5)", () => {
  beforeEach(() => {
    vi.useFakeTimers();
    const storage = createSessionStorageMock();
    vi.stubGlobal("sessionStorage", storage);
    vi.stubGlobal("window", {
      sessionStorage: storage,
      location: { pathname: ROOM, search: "" },
      setTimeout: (fn: () => void, ms: number) => setTimeout(fn, ms),
    });
    ackNativePushRouteConsumed.mockClear();
  });

  afterEach(() => {
    vi.runOnlyPendingTimers();
    vi.useRealTimers();
    vi.unstubAllGlobals();
  });

  it("redirects again for the same key after the previous redirect ran", () => {
    const router = { replace: vi.fn() };
    redirectResourceAccessDenied(router, "/community-messenger");
    vi.advanceTimersByTime(500);
    expect(router.replace).toHaveBeenCalledTimes(1);

    redirectResourceAccessDenied(router, "/community-messenger");
    vi.advanceTimersByTime(500);
    expect(router.replace).toHaveBeenCalledTimes(2);
  });

  it("ignores the same key while a redirect is still pending", () => {
    const router = { replace: vi.fn() };
    redirectResourceAccessDenied(router, "/community-messenger");
    redirectResourceAccessDenied(router, "/community-messenger");
    vi.advanceTimersByTime(500);
    expect(router.replace).toHaveBeenCalledTimes(1);
  });

  it("discards the pending push route only when it is the denied destination", async () => {
    writePendingPushRoute({ path: ROOM, at: Date.now() });
    redirectResourceAccessDenied({ replace: vi.fn() }, "/community-messenger");
    expect(readPendingPushRoute()).toBeNull();
    await vi.dynamicImportSettled();
    expect(ackNativePushRouteConsumed).toHaveBeenCalledWith({ path: ROOM });
  });

  it("keeps a pending push route for a different destination", () => {
    vi.advanceTimersByTime(500);
    writePendingPushRoute({ path: "/community-messenger/rooms/other-room", at: Date.now() });
    redirectResourceAccessDenied({ replace: vi.fn() }, "/community-messenger", { dedupeKey: "k-other" });
    expect(readPendingPushRoute()?.path).toBe("/community-messenger/rooms/other-room");
  });
});
