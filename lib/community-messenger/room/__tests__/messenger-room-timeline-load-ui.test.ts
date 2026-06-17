import { describe, expect, it } from "vitest";
import { resolveMessengerRoomTimelineLoadUi } from "@/lib/community-messenger/room/messenger-room-timeline-load-ui";

describe("resolveMessengerRoomTimelineLoadUi", () => {
  it("messages painted → ok", () => {
    expect(
      resolveMessengerRoomTimelineLoadUi({
        loading: true,
        displayMessageCount: 3,
        timelineLoadFailed: true,
        roomMessagesLength: 3,
        snapshotMessagesLength: 0,
        lastMessage: "hi",
      })
    ).toBe("ok");
  });

  it("no hint → ok (empty room)", () => {
    expect(
      resolveMessengerRoomTimelineLoadUi({
        loading: false,
        displayMessageCount: 0,
        timelineLoadFailed: false,
        roomMessagesLength: 0,
        snapshotMessagesLength: 0,
        lastMessage: null,
      })
    ).toBe("ok");
  });

  it("hint + loading → loading", () => {
    expect(
      resolveMessengerRoomTimelineLoadUi({
        loading: true,
        displayMessageCount: 0,
        timelineLoadFailed: false,
        roomMessagesLength: 0,
        snapshotMessagesLength: 0,
        lastMessage: "last",
      })
    ).toBe("loading");
  });

  it("hint + failed → retry", () => {
    expect(
      resolveMessengerRoomTimelineLoadUi({
        loading: false,
        displayMessageCount: 0,
        timelineLoadFailed: true,
        roomMessagesLength: 0,
        snapshotMessagesLength: 0,
        lastMessage: "last",
      })
    ).toBe("retry");
  });
});
