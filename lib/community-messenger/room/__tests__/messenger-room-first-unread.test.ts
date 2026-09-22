import { describe, expect, it } from "vitest";
import {
  countUnreadMessagesBelow,
  formatUnreadBadgeCount,
  resolveFabReadFloorMessageId,
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
      })
    ).toBe(0);
  });

  it("TEST F — missing canonical cursor does not resurrect loaded history", () => {
    expect(
      countUnreadMessagesBelow({
        messages: msgs,
        lastReadMessageId: null,
        afterMessageId: "a",
      })
    ).toBe(0);
    expect(
      countUnreadMessagesBelow({
        messages: msgs,
        lastReadMessageId: "",
        afterMessageId: null,
      })
    ).toBe(0);
  });

  it("resolveFabReadFloorMessageId picks farthest cursor in window (never regresses)", () => {
    expect(
      resolveFabReadFloorMessageId({
        messages: msgs,
        cursors: ["a", "c", "missing"],
      })
    ).toBe("c");
    expect(
      resolveFabReadFloorMessageId({
        messages: msgs,
        cursors: ["stale-only", null, ""],
      })
    ).toBeNull();
  });

  it("TEST A — stale client cursor, canon=0: floor stays at tip/current read → badge 0", () => {
    const history = [
      { id: "old-a", isMine: false },
      { id: "old-b", isMine: false },
      ...Array.from({ length: 8 }, (_, i) => ({ id: `seed-${i}`, isMine: false as const })),
      { id: "tip", isMine: false },
    ];
    const floor = resolveFabReadFloorMessageId({
      messages: history,
      cursors: ["old-a" /* stale viewer */, "tip" /* canonical / cache */],
    });
    expect(floor).toBe("tip");
    const remaining = countUnreadMessagesBelow({
      messages: history,
      lastReadMessageId: floor,
      afterMessageId: "old-b",
    });
    expect(remaining).toBe(0);
    expect(resolveJumpToLatestFabState({ atLatest: false, remainingUnreadCount: remaining })).toEqual({
      visible: true,
      badgeCount: 0,
    });
  });

  it("TEST B — exact Production S6: stale viewer + canonical floor → badge 1 (not H+U)", () => {
    const base = [
      { id: "a0ed1390-stale", isMine: false },
      { id: "leftover", isMine: false },
      ...Array.from({ length: 8 }, (_, i) => ({ id: `seed-${i}`, isMine: false as const })),
      { id: "4075dd59-canonical", isMine: false },
    ];
    const withOne = [...base, { id: "new-1", isMine: false }];
    const floor = resolveFabReadFloorMessageId({
      messages: withOne,
      cursors: ["a0ed1390-stale", "4075dd59-canonical"],
    });
    expect(floor).toBe("4075dd59-canonical");
    /** Stale alone would recount history+new */
    expect(
      countUnreadMessagesBelow({
        messages: withOne,
        lastReadMessageId: "a0ed1390-stale",
        afterMessageId: "leftover",
      })
    ).toBeGreaterThan(1);
    const one = countUnreadMessagesBelow({
      messages: withOne,
      lastReadMessageId: floor,
      afterMessageId: "leftover",
    });
    expect(one).toBe(1);
    expect(resolveJumpToLatestFabState({ atLatest: false, remainingUnreadCount: one })).toEqual({
      visible: true,
      badgeCount: 1,
    });
  });

  it("TEST C — two genuine new messages with same stale client cursor → badge 2", () => {
    const base = [
      { id: "a0ed1390-stale", isMine: false },
      ...Array.from({ length: 8 }, (_, i) => ({ id: `seed-${i}`, isMine: false as const })),
      { id: "4075dd59-canonical", isMine: false },
    ];
    const withTwo = [...base, { id: "new-1", isMine: false }, { id: "new-2", isMine: false }];
    const floor = resolveFabReadFloorMessageId({
      messages: withTwo,
      cursors: ["a0ed1390-stale", "4075dd59-canonical"],
    });
    expect(
      countUnreadMessagesBelow({
        messages: withTwo,
        lastReadMessageId: floor,
        afterMessageId: "seed-0",
      })
    ).toBe(2);
  });

  it("TEST D — pagination grows window; historical rows never re-enter badge", () => {
    const tip = { id: "4075dd59-canonical", isMine: false as const };
    const seeds = Array.from({ length: 8 }, (_, i) => ({ id: `seed-${i}`, isMine: false as const }));
    const history = [{ id: "a0ed1390-stale", isMine: false as const }, ...seeds, tip];
    const paged = [
      { id: "older-1", isMine: false },
      { id: "older-2", isMine: false },
      ...history,
    ];
    const floor = resolveFabReadFloorMessageId({
      messages: paged,
      cursors: ["a0ed1390-stale", "4075dd59-canonical"],
    });
    expect(floor).toBe("4075dd59-canonical");
    expect(
      countUnreadMessagesBelow({
        messages: paged,
        lastReadMessageId: floor,
        afterMessageId: "older-1",
      })
    ).toBe(0);
  });

  it("TEST E — viewport narrowing counts only unread below lastVisible, never historical read", () => {
    const rows = [
      { id: "read-tip", isMine: false },
      { id: "u1", isMine: false },
      { id: "u2", isMine: false },
      { id: "u3", isMine: false },
    ];
    expect(
      countUnreadMessagesBelow({
        messages: rows,
        lastReadMessageId: "read-tip",
        afterMessageId: "read-tip",
      })
    ).toBe(3);
    expect(
      countUnreadMessagesBelow({
        messages: rows,
        lastReadMessageId: "read-tip",
        afterMessageId: "u1",
      })
    ).toBe(2);
    expect(
      countUnreadMessagesBelow({
        messages: rows,
        lastReadMessageId: "read-tip",
        afterMessageId: "u2",
      })
    ).toBe(1);
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
