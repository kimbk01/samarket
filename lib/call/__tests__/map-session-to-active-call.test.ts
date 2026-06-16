import { describe, expect, it } from "vitest";
import { mapSessionStatusToActiveCallPhase } from "@/lib/call/map-session-to-active-call";

describe("mapSessionStatusToActiveCallPhase", () => {
  it("maps ringing initiator to dialing", () => {
    expect(
      mapSessionStatusToActiveCallPhase({ status: "ringing", isMineInitiator: true }, false),
    ).toBe("dialing");
  });

  it("maps ringing callee to ringing", () => {
    expect(
      mapSessionStatusToActiveCallPhase({ status: "ringing", isMineInitiator: false }, false),
    ).toBe("ringing");
  });

  it("maps active before join to connecting", () => {
    expect(mapSessionStatusToActiveCallPhase({ status: "active", isMineInitiator: true }, false)).toBe(
      "connecting",
    );
  });

  it("maps active after join to active", () => {
    expect(mapSessionStatusToActiveCallPhase({ status: "active", isMineInitiator: false }, true)).toBe(
      "active",
    );
  });

  it("maps terminal statuses", () => {
    expect(mapSessionStatusToActiveCallPhase({ status: "missed", isMineInitiator: false }, false)).toBe(
      "missed",
    );
    expect(mapSessionStatusToActiveCallPhase({ status: "rejected", isMineInitiator: false }, false)).toBe(
      "ended",
    );
  });
});
