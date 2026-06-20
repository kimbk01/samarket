import { afterEach, describe, expect, it, vi } from "vitest";
import {
  beginCallDeepRouteNavigationLock,
  beginRoomDeepRouteNavigationLock,
  CM_DEEP_ROUTE_NAV_LOCK_TTL_MS,
  evaluateDeepRouteNavigationGuard,
  isDeepRouteNavigationLockActive,
  resetDeepRouteNavigationLockForTests,
} from "@/lib/navigation/cm-deep-route-navigation-lock";

describe("cm-deep-route-navigation-lock", () => {
  afterEach(() => {
    resetDeepRouteNavigationLockForTests();
    vi.useRealTimers();
  });

  it("blocks bottom nav async replace to /mypage during room entry lock", () => {
    beginRoomDeepRouteNavigationLock("room-1", "/community-messenger/rooms/room-1");
    expect(isDeepRouteNavigationLockActive()).toBe(true);

    const verdict = evaluateDeepRouteNavigationGuard("/mypage", { source: "bottom_nav_async" });
    expect(verdict.allow).toBe(false);
    expect(verdict.blockReason).toBe("deep_route_lock_room_active");
  });

  it("allows explicit bottom nav during lock and clears lock", () => {
    beginRoomDeepRouteNavigationLock("room-1", "/community-messenger/rooms/room-1");
    const verdict = evaluateDeepRouteNavigationGuard("/mypage", { source: "bottom_nav_explicit" });
    expect(verdict.allow).toBe(true);
    expect(isDeepRouteNavigationLockActive()).toBe(false);
  });

  it("allows navigation after TTL expires", () => {
    vi.useFakeTimers();
    beginRoomDeepRouteNavigationLock("room-1", "/community-messenger/rooms/room-1");
    vi.advanceTimersByTime(CM_DEEP_ROUTE_NAV_LOCK_TTL_MS + 1);
    const verdict = evaluateDeepRouteNavigationGuard("/mypage", { source: "programmatic" });
    expect(verdict.allow).toBe(true);
    expect(isDeepRouteNavigationLockActive()).toBe(false);
  });

  it("allows call route family during call lock", () => {
    beginCallDeepRouteNavigationLock("tmp-1", "/community-messenger/calls/tmp-1");
    const verdict = evaluateDeepRouteNavigationGuard("/community-messenger/calls/real-session", {
      source: "programmatic",
    });
    expect(verdict.allow).toBe(true);
  });
});
