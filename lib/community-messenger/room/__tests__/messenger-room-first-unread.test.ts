import { describe, expect, it } from "vitest";
import {
  countUnreadMessagesBelow,
  formatUnreadBadgeCount,
  resolveFirstUnreadMessageId,
  resolveJumpToLatestFabState,
  resolveNextUnreadMessageId,
} from "@/lib/community-messenger/room/messenger-room-first-unread";

const msgs = [
  { id: "a", isMine: false },
  { id: "b", isMine: true },
  { id: "c", isMine: false },
  { id: "d", isMine: false },
  { id: "e", isMine: true },
];

describe("messenger-room-first-unread", () => {
  it("resolves first unread as message after lastRead", () => {
    expect(
      resolveFirstUnreadMessageId({ messages: msgs, lastReadMessageId: "b" })
    ).toBe("c");
  });

  it("skips system/pending/mine after lastRead", () => {
    expect(
      resolveFirstUnreadMessageId({
        messages: [
          { id: "b", isMine: true },
          { id: "s", isMine: false, messageType: "system" },
          { id: "p", isMine: false, pending: true },
          { id: "m", isMine: true },
          { id: "u", isMine: false },
        ],
        lastReadMessageId: "b",
      })
    ).toBe("u");
  });

  it("includes unread call_stub in first/next unread ordering", () => {
    const rows = [
      { id: "a", isMine: true },
      { id: "call", isMine: false, messageType: "call_stub" },
      { id: "text", isMine: false, messageType: "text" },
    ];
    expect(resolveFirstUnreadMessageId({ messages: rows, lastReadMessageId: "a" })).toBe("call");
    expect(
      resolveNextUnreadMessageId({
        messages: rows,
        lastReadMessageId: "a",
        afterMessageId: "call",
      })
    ).toBe("text");
  });

  it("returns null when lastRead missing (no fake)", () => {
    expect(
      resolveFirstUnreadMessageId({ messages: msgs, lastReadMessageId: "missing" })
    ).toBeNull();
  });

  it("returns null when nothing after lastRead is unread", () => {
    expect(
      resolveFirstUnreadMessageId({
        messages: [
          { id: "a", isMine: false },
          { id: "b", isMine: true },
        ],
        lastReadMessageId: "b",
      })
    ).toBeNull();
  });

  it("counts unread below afterMessageId (helper only — not FAB authority)", () => {
    expect(
      countUnreadMessagesBelow({
        messages: msgs,
        lastReadMessageId: "a",
        afterMessageId: "c",
      })
    ).toBe(1); // d
  });

  it("formats 99+ badge", () => {
    expect(formatUnreadBadgeCount(0)).toBe("");
    expect(formatUnreadBadgeCount(8)).toBe("8");
    expect(formatUnreadBadgeCount(99)).toBe("99");
    expect(formatUnreadBadgeCount(100)).toBe("99+");
  });

  it("FAB uses canonical remaining unread below viewport", () => {
    expect(resolveJumpToLatestFabState({ atLatest: true, remainingUnreadCount: 0 })).toEqual({
      visible: false,
      badgeCount: 0,
    });
    expect(resolveJumpToLatestFabState({ atLatest: false, remainingUnreadCount: 0 })).toEqual({
      visible: true,
      badgeCount: 0,
    });
    expect(resolveJumpToLatestFabState({ atLatest: false, remainingUnreadCount: 93 })).toEqual({
      visible: true,
      badgeCount: 93,
    });
    expect(resolveJumpToLatestFabState({ atLatest: true, remainingUnreadCount: 3 })).toEqual({
      visible: true,
      badgeCount: 3,
    });
  });
});
