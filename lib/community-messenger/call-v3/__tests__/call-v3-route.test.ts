import { describe, expect, it, vi } from "vitest";
import {
  buildCallV3ScreenHref,
  rememberCallV3ReturnPath,
  routeBackFromCallV3,
  routeToCallV3Screen,
  takeCallV3ReturnPath,
} from "@/lib/community-messenger/call-v3/call-v3-route";

describe("call-v3-route", () => {
  it("builds calls-v3 href", () => {
    expect(buildCallV3ScreenHref("abc-123")).toBe("/community-messenger/calls-v3/abc-123");
  });

  it("routes to calls-v3 screen", () => {
    const push = vi.fn();
    routeToCallV3Screen({ push }, "call-9");
    expect(push).toHaveBeenCalledWith("/community-messenger/calls-v3/call-9");
  });

  it("returns to remembered path after cancel", () => {
    const storage = new Map<string, string>();
    vi.stubGlobal("window", {
      location: { pathname: "/community-messenger/rooms/room-1", search: "" },
    });
    vi.stubGlobal("sessionStorage", {
      setItem: (k: string, v: string) => storage.set(k, v),
      getItem: (k: string) => storage.get(k) ?? null,
      removeItem: (k: string) => storage.delete(k),
    });

    rememberCallV3ReturnPath();
    const replace = vi.fn();
    routeBackFromCallV3({ replace });
    expect(replace).toHaveBeenCalledWith("/community-messenger/rooms/room-1");
    expect(takeCallV3ReturnPath()).toBeNull();

    vi.unstubAllGlobals();
  });
});
