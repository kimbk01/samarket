import { describe, expect, it, vi } from "vitest";
import {
  exitCommunityMessengerCallRouteNow,
  isSoftCallRouteExit,
} from "@/lib/community-messenger/call-route-exit";

describe("call-route-exit SSOT", () => {
  it("soft exit excludes join failure terminal", () => {
    expect(isSoftCallRouteExit("ended", "failed_network")).toBe(false);
    expect(isSoftCallRouteExit("cancelled", null)).toBe(true);
  });

  it("exits once per sessionId", () => {
    const replace = vi.fn();
    const onceRef = { current: null as string | null };
    expect(
      exitCommunityMessengerCallRouteNow({
        router: { replace },
        sessionId: "s1",
        target: "back",
        source: "test",
        onceRef,
      })
    ).toBe(true);
    expect(replace).toHaveBeenCalledTimes(1);
    expect(
      exitCommunityMessengerCallRouteNow({
        router: { replace },
        sessionId: "s1",
        target: "back",
        source: "test",
        onceRef,
      })
    ).toBe(false);
    expect(replace).toHaveBeenCalledTimes(1);
  });
});
