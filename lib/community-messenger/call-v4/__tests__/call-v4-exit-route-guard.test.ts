import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@/lib/community-messenger/call-v4/call-v4-debug", () => ({ logCallV4: vi.fn() }));

import {
  exitCallV4ScreenAfterCleanup,
  rememberCallV4ReturnPath,
  shouldSkipCallV4ExitNavigation,
} from "@/lib/community-messenger/call-v4/call-v4-route";

function stubLocation(pathname: string, search = "") {
  const store = new Map<string, string>();
  const storage = {
    getItem: (k: string) => store.get(k) ?? null,
    setItem: (k: string, v: string) => void store.set(k, String(v)),
    removeItem: (k: string) => void store.delete(k),
  };
  const location = { pathname, search };
  vi.stubGlobal("window", { location, sessionStorage: storage });
  vi.stubGlobal("sessionStorage", storage);
  return location;
}

describe("v4 call terminal exit route guard (Fix 3)", () => {
  beforeEach(() => {
    vi.unstubAllGlobals();
  });
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("call ended on the v4 call screen → returns to the origin screen (unchanged)", () => {
    const loc = stubLocation("/community-messenger/rooms/room-a", "?x=1");
    rememberCallV4ReturnPath();
    loc.pathname = "/community-messenger/calls-v4/call-1";
    loc.search = "?source=outgoing";
    const router = { replace: vi.fn() };
    exitCallV4ScreenAfterCleanup(router);
    expect(router.replace).toHaveBeenCalledWith("/community-messenger/rooms/room-a?x=1");
  });

  it("iPhone: call ended while user is chatting in ANOTHER room → stays (no forced move)", () => {
    const loc = stubLocation("/community-messenger/rooms/room-a");
    rememberCallV4ReturnPath();
    loc.pathname = "/community-messenger/rooms/room-b"; // CallKit/native call UI; WebView moved on
    const router = { replace: vi.fn() };
    exitCallV4ScreenAfterCleanup(router);
    expect(router.replace).not.toHaveBeenCalled();
  });

  it("launch failed before the URL switched to the call screen → still issues the return (pending push superseded)", () => {
    stubLocation("/community-messenger/rooms/room-a");
    rememberCallV4ReturnPath(); // launch stores origin; router.push(/calls-v4/…) not committed yet
    const router = { replace: vi.fn() };
    exitCallV4ScreenAfterCleanup(router);
    expect(router.replace).toHaveBeenCalledWith("/community-messenger/rooms/room-a");
  });

  it("no recorded return path → cannot decide → previous behaviour (call logs)", () => {
    stubLocation("/community-messenger/rooms/room-b");
    const router = { replace: vi.fn() };
    exitCallV4ScreenAfterCleanup(router);
    expect(router.replace).toHaveBeenCalledWith("/community-messenger?section=call_logs");
  });

  it("stale return path is consumed even when navigation is skipped", () => {
    const loc = stubLocation("/community-messenger/rooms/room-a");
    rememberCallV4ReturnPath();
    loc.pathname = "/community-messenger/rooms/room-b";
    exitCallV4ScreenAfterCleanup({ replace: vi.fn() });
    // next exit (e.g. a later call without remembered path) must not reuse room-a
    loc.pathname = "/community-messenger/calls-v4/call-2";
    const router = { replace: vi.fn() };
    exitCallV4ScreenAfterCleanup(router);
    expect(router.replace).toHaveBeenCalledWith("/community-messenger?section=call_logs");
  });

  it("server/SSR (no window) → unchanged", () => {
    expect(shouldSkipCallV4ExitNavigation("/community-messenger/rooms/room-a")).toBe(false);
  });
});
