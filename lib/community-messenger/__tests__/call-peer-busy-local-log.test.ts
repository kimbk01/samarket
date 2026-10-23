import { describe, expect, it } from "vitest";
import { getCallMessageText } from "@/lib/community-messenger/call-event-message";

describe("peer_busy call stub text", () => {
  it("shows peer-busy message for caller", () => {
    expect(
      getCallMessageText({
        callKind: "voice",
        eventType: "peer_busy",
        viewerUserId: "caller-1",
        initiatorUserId: "caller-1",
      })
    ).toBe("음성 통화 · 통화 중");
  });

  it("shows self-busy message for dialer already live", () => {
    expect(
      getCallMessageText({
        callKind: "voice",
        eventType: "caller_busy",
        viewerUserId: "caller-1",
        initiatorUserId: "caller-1",
      })
    ).toBe("음성 통화 · 다른 통화 중");
  });
});
