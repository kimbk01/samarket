import { describe, expect, it } from "vitest";
import { resolveGroupCallSessionStatusAfterParticipantChange } from "@/lib/community-messenger/service";

describe("resolveGroupCallSessionStatusAfterParticipantChange", () => {
  it("keeps active when 2+ joined remain after leave", () => {
    expect(
      resolveGroupCallSessionStatusAfterParticipantChange({
        joinedCount: 2,
        invitedCount: 0,
        action: "leave",
      })
    ).toBe("active");
  });

  it("ends session when one joined remains and no invites", () => {
    expect(
      resolveGroupCallSessionStatusAfterParticipantChange({
        joinedCount: 1,
        invitedCount: 0,
        action: "leave",
      })
    ).toBe("ended");
  });

  it("stays ringing when invites remain", () => {
    expect(
      resolveGroupCallSessionStatusAfterParticipantChange({
        joinedCount: 1,
        invitedCount: 2,
        action: "leave",
      })
    ).toBe("active");
  });
});
