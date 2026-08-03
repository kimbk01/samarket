import { describe, expect, it } from "vitest";
import {
  countRemainingUnreadAfterCursor,
  isReadCursorMonotonicAdvance,
  resolveVisibleRangeReadCursor,
} from "@/lib/community-messenger/room/messenger-room-visible-range-read";

const msgs = [
  { id: "a", isMine: false, messageType: "text" },
  { id: "b", isMine: false, messageType: "call_stub" },
  { id: "c", isMine: true, messageType: "text" },
  { id: "d", isMine: false, messageType: "text" },
  { id: "e", isMine: false, messageType: "text", pending: true },
  { id: "f", isMine: false, messageType: "text" },
];

describe("messenger-room-visible-range-read", () => {
  it("advances cursor only through visible non-pending rows including call_stub", () => {
    const visible = new Set(["b", "c"]);
    const cursor = resolveVisibleRangeReadCursor({
      messages: msgs,
      previousCursorId: "a",
      isVisible: (id) => visible.has(id),
    });
    expect(cursor).toBe("c");
  });

  it("does not mark concurrent unseen tail as read", () => {
    const visible = new Set(["b"]);
    const cursor = resolveVisibleRangeReadCursor({
      messages: msgs,
      previousCursorId: "a",
      isVisible: (id) => visible.has(id),
    });
    expect(cursor).toBe("b");
    expect(cursor).not.toBe("f");
  });

  it("enforces monotonic cursor advance", () => {
    expect(
      isReadCursorMonotonicAdvance({
        messages: msgs,
        previousCursorId: "b",
        nextCursorId: "d",
      })
    ).toBe(true);
    expect(
      isReadCursorMonotonicAdvance({
        messages: msgs,
        previousCursorId: "d",
        nextCursorId: "b",
      })
    ).toBe(false);
    expect(
      isReadCursorMonotonicAdvance({
        messages: msgs,
        previousCursorId: "d",
        nextCursorId: "d",
      })
    ).toBe(false);
  });

  it("remaining unread includes call_stub and excludes mine/pending after cursor", () => {
    expect(
      countRemainingUnreadAfterCursor({
        messages: msgs,
        viewerLastReadMessageId: "a",
      })
    ).toBe(3); // b(call_stub), d, f — not c(mine), not e(pending)
  });
});
