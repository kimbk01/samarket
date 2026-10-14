import { describe, expect, it } from "vitest";
import { isEmptyTextTimelineGhost } from "@/lib/community-messenger/room/empty-text-timeline-ghost";

describe("isEmptyTextTimelineGhost", () => {
  it("omits non-pending empty text", () => {
    expect(
      isEmptyTextTimelineGhost({
        id: "g1",
        roomId: "r",
        senderId: "peer",
        senderLabel: "상대",
        messageType: "text",
        content: "",
        createdAt: "2026-10-14T00:00:00.000Z",
        isMine: false,
      })
    ).toBe(true);
  });

  it("keeps pending empty file/text and call_stub and tombstone", () => {
    expect(
      isEmptyTextTimelineGhost({
        id: "p1",
        roomId: "r",
        senderId: "me",
        senderLabel: "나",
        messageType: "text",
        content: "",
        createdAt: "t",
        isMine: true,
        pending: true,
      })
    ).toBe(false);
    expect(
      isEmptyTextTimelineGhost({
        id: "c1",
        roomId: "r",
        senderId: "peer",
        senderLabel: "상대",
        messageType: "call_stub",
        content: "",
        createdAt: "t",
        isMine: false,
      })
    ).toBe(false);
    expect(
      isEmptyTextTimelineGhost({
        id: "d1",
        roomId: "r",
        senderId: "peer",
        senderLabel: "상대",
        messageType: "text",
        content: "",
        createdAt: "t",
        isMine: false,
        deletedForEveryoneAt: "2026-10-14T00:00:01.000Z",
      })
    ).toBe(false);
  });
});
