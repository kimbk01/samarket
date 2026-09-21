import { describe, expect, it } from "vitest";
import {
  countUnreadMessagesBelow,
  formatUnreadBadgeCount,
  resolveFirstUnreadMessageId,
  resolveJumpToLatestFabAction,
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

  it("CUT-4: lastRead missing from window must not viewport-count history as unread", () => {
    expect(
      countUnreadMessagesBelow({
        messages: msgs,
        lastReadMessageId: "missing-cursor",
        afterMessageId: "a",
        canonicalUnreadCount: 0,
      })
    ).toBe(0);
    expect(
      countUnreadMessagesBelow({
        messages: msgs,
        lastReadMessageId: "missing-cursor",
        afterMessageId: "a",
      })
    ).toBe(0);
  });

  it("CUT-4 Production S1→S5: history scroll with canon=0 keeps badge 0 (no resurrection)", () => {
    /** 8 already-read peer rows + tip lastRead (or stale client lastRead masked at bottom). */
    const history = [
      { id: "old-a", isMine: false },
      { id: "old-b", isMine: false },
      ...Array.from({ length: 8 }, (_, i) => ({ id: `seed-${i}`, isMine: false as const })),
      { id: "tip", isMine: false },
    ];
    /** S1 at bottom: lastVisible=tip; even stale lastRead is masked → 0 */
    expect(
      countUnreadMessagesBelow({
        messages: history,
        lastReadMessageId: "old-a",
        afterMessageId: "tip",
        canonicalUnreadCount: 0,
      })
    ).toBe(0);
    expect(resolveJumpToLatestFabState({ atLatest: true, remainingUnreadCount: 0 })).toEqual({
      visible: false,
      badgeCount: 0,
    });

    /** S2/S5 scroll up: lastVisible among history; canon still 0 → tip floor → badge 0 */
    const remaining = countUnreadMessagesBelow({
      messages: history,
      lastReadMessageId: "old-a",
      afterMessageId: "old-b",
      canonicalUnreadCount: 0,
    });
    expect(remaining).toBe(0);
    expect(resolveJumpToLatestFabState({ atLatest: false, remainingUnreadCount: remaining })).toEqual({
      visible: true,
      badgeCount: 0,
    });

    /** S3 pagination grows window — still canon=0 */
    const paged = [
      { id: "older-1", isMine: false },
      { id: "older-2", isMine: false },
      ...history,
    ];
    expect(
      countUnreadMessagesBelow({
        messages: paged,
        lastReadMessageId: "old-a",
        afterMessageId: "older-1",
        canonicalUnreadCount: 0,
      })
    ).toBe(0);
  });

  it("CUT-4 Production S6: genuine new-below increments badge 1 then 2 (not history+new)", () => {
    const base = [
      { id: "old-a", isMine: false },
      { id: "old-b", isMine: false },
      ...Array.from({ length: 8 }, (_, i) => ({ id: `seed-${i}`, isMine: false as const })),
      { id: "tip-read", isMine: false },
    ];
    const withOne = [...base, { id: "new-1", isMine: false }];
    const one = countUnreadMessagesBelow({
      messages: withOne,
      lastReadMessageId: "tip-read",
      afterMessageId: "old-b",
      canonicalUnreadCount: 1,
    });
    expect(one).toBe(1);
    expect(resolveJumpToLatestFabState({ atLatest: false, remainingUnreadCount: one })).toEqual({
      visible: true,
      badgeCount: 1,
    });

    const withTwo = [...withOne, { id: "new-2", isMine: false }];
    const two = countUnreadMessagesBelow({
      messages: withTwo,
      lastReadMessageId: "tip-read",
      afterMessageId: "old-b",
      canonicalUnreadCount: 2,
    });
    expect(two).toBe(2);
  });

  it("CUT-4: entry unread (canon>0) still counts after lastRead", () => {
    const entry = [
      { id: "read-tip", isMine: false },
      { id: "u1", isMine: false },
      { id: "u2", isMine: false },
      { id: "u3", isMine: false },
    ];
    expect(
      countUnreadMessagesBelow({
        messages: entry,
        lastReadMessageId: "read-tip",
        afterMessageId: "read-tip",
        canonicalUnreadCount: 3,
      })
    ).toBe(3);
    expect(
      countUnreadMessagesBelow({
        messages: entry,
        lastReadMessageId: "read-tip",
        afterMessageId: null,
        canonicalUnreadCount: 3,
      })
    ).toBe(3);
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

  it("FAB action jumps to first unread once, then latest (Telegram pagedown)", () => {
    expect(
      resolveJumpToLatestFabAction({
        messages: msgs,
        lastReadMessageId: "b",
        lastVisibleMessageId: "a",
        remainingUnreadCount: 2,
      })
    ).toEqual({ kind: "first_unread", messageId: "c" });

    expect(
      resolveJumpToLatestFabAction({
        messages: msgs,
        lastReadMessageId: "b",
        lastVisibleMessageId: "c",
        remainingUnreadCount: 1,
      })
    ).toEqual({ kind: "latest" });

    expect(
      resolveJumpToLatestFabAction({
        messages: msgs,
        lastReadMessageId: "b",
        lastVisibleMessageId: "d",
        remainingUnreadCount: 0,
      })
    ).toEqual({ kind: "latest" });

    expect(
      resolveJumpToLatestFabAction({
        messages: msgs,
        lastReadMessageId: "missing",
        lastVisibleMessageId: "a",
        remainingUnreadCount: 3,
      })
    ).toEqual({ kind: "latest" });
  });
});
