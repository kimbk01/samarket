import { describe, expect, it } from "vitest";
import { resolveIncomingCallLane } from "@/lib/community-messenger/incoming-call/incoming-call-lane";

describe("incoming-call-lane", () => {
  it("routes callee accept to call_screen_accept", () => {
    expect(
      resolveIncomingCallLane({
        calleeAcceptRoute: true,
        sessionStatus: "ringing",
        incomingSessionId: "abc",
      }).surface
    ).toBe("call_screen_accept");
  });

  it("routes foreground ringing to web_banner", () => {
    const lane = resolveIncomingCallLane({
      visibilityState: "visible",
      isAppForeground: true,
      sessionStatus: "ringing",
      incomingSessionId: "abc",
      pathname: "/community-messenger/rooms/room1",
    });
    expect(lane.surface).toBe("web_banner");
  });

  it("returns none when not ringing", () => {
    expect(
      resolveIncomingCallLane({
        sessionStatus: "active",
        incomingSessionId: "abc",
      }).surface
    ).toBe("none");
  });
});
