import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@/lib/community-messenger/call-v4/call-v4-debug", () => ({ logCallV4: vi.fn() }));
vi.mock("@/lib/community-messenger/call-v4/call-v4-native-accept-flight", () => ({
  isNativeAcceptInflight: () => false,
}));

import {
  maybeExitCallV4ScreenAfterCleanup,
  resetCallV4WebCallScreenReadyForTests,
} from "@/lib/community-messenger/call-v4/call-v4-exit-guard";
import { rememberCallV4ReturnPath } from "@/lib/community-messenger/call-v4/call-v4-route";
import { useCallV4Store } from "@/lib/community-messenger/call-v4/call-v4-store";

function stubLocation(pathname: string) {
  const store = new Map<string, string>();
  const storage = {
    getItem: (k: string) => store.get(k) ?? null,
    setItem: (k: string, v: string) => void store.set(k, String(v)),
    removeItem: (k: string) => void store.delete(k),
  };
  const location = { pathname, search: "" };
  vi.stubGlobal("window", { location, sessionStorage: storage });
  vi.stubGlobal("sessionStorage", storage);
  return location;
}

/** Real guard → real route (Fix 3) through the 8 s deferred fallback timer. */
describe("v4 deferred exit (8 s fallback) × current-route guard", () => {
  beforeEach(() => {
    vi.useFakeTimers();
    resetCallV4WebCallScreenReadyForTests();
    useCallV4Store.getState().resetToIdle();
    useCallV4Store.getState().setPhase("incoming_ringing");
  });
  afterEach(() => {
    resetCallV4WebCallScreenReadyForTests();
    vi.useRealTimers();
    vi.unstubAllGlobals();
  });

  it("still on the call screen when the fallback fires → returns to origin", () => {
    const loc = stubLocation("/community-messenger/rooms/room-a");
    rememberCallV4ReturnPath();
    loc.pathname = "/community-messenger/calls-v4/call-1";
    const router = { replace: vi.fn() };
    maybeExitCallV4ScreenAfterCleanup("call-1", "ended", router);
    expect(router.replace).not.toHaveBeenCalled();
    vi.advanceTimersByTime(7_999);
    expect(router.replace).not.toHaveBeenCalled();
    vi.advanceTimersByTime(1);
    expect(router.replace).toHaveBeenCalledWith("/community-messenger/rooms/room-a");
  });

  it("user moved to another room during the 8 s window → fallback does not drag them back", () => {
    const loc = stubLocation("/community-messenger/rooms/room-a");
    rememberCallV4ReturnPath();
    loc.pathname = "/community-messenger/calls-v4/call-1";
    const router = { replace: vi.fn() };
    maybeExitCallV4ScreenAfterCleanup("call-1", "ended", router);
    loc.pathname = "/community-messenger/rooms/room-b";
    vi.advanceTimersByTime(8_000);
    expect(router.replace).not.toHaveBeenCalled();
  });

  it("call screen URL never committed before the fallback → still returns to origin (pre-commit failure kept)", () => {
    stubLocation("/community-messenger/rooms/room-a");
    rememberCallV4ReturnPath();
    const router = { replace: vi.fn() };
    maybeExitCallV4ScreenAfterCleanup("call-1", "ended", router);
    vi.advanceTimersByTime(8_000);
    expect(router.replace).toHaveBeenCalledWith("/community-messenger/rooms/room-a");
  });
});
