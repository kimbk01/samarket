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
    ).toContain("상대방이 통화 중");
  });
});
