import { describe, expect, it } from "vitest";
import { resolveMessengerRoomTimelineLoadUi } from "@/lib/community-messenger/room/messenger-room-timeline-load-ui";

describe("resolveMessengerRoomTimelineLoadUi", () => {
  it("messages painted → ok", () => {
    expect(
      resolveMessengerRoomTimelineLoadUi({
        loading: true,
        displayMessageCount: 3,
        timelineLoadFailed: true,
        timelineInitialLoadComplete: false,
        roomMessagesLength: 3,
        snapshotMessagesLength: 0,
        lastMessage: "hi",
      })
    ).toBe("ok");
  });

  it("roomMessages only → ok", () => {
    expect(
      resolveMessengerRoomTimelineLoadUi({
        loading: true,
        displayMessageCount: 0,
        timelineLoadFailed: false,
        timelineInitialLoadComplete: false,
        roomMessagesLength: 2,
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
        timelineInitialLoadComplete: true,
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
        timelineInitialLoadComplete: false,
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
        timelineInitialLoadComplete: false,
        roomMessagesLength: 0,
        snapshotMessagesLength: 0,
        lastMessage: "last",
      })
    ).toBe("retry");
  });

  it("hint + bootstrap unfinished → loading (skeleton, not retry blank chrome)", () => {
    expect(
      resolveMessengerRoomTimelineLoadUi({
        loading: false,
        displayMessageCount: 0,
        timelineLoadFailed: false,
        timelineInitialLoadComplete: false,
        roomMessagesLength: 0,
        snapshotMessagesLength: 0,
        lastMessage: "last",
      })
    ).toBe("loading");
  });

  it("initial load complete with empty timeline → ok", () => {
    expect(
      resolveMessengerRoomTimelineLoadUi({
        loading: false,
        displayMessageCount: 0,
        timelineLoadFailed: false,
        timelineInitialLoadComplete: true,
        roomMessagesLength: 0,
        snapshotMessagesLength: 0,
        lastMessage: "last",
      })
    ).toBe("ok");
  });
});
