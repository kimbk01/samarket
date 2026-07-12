import { describe, expect, it } from "vitest";
import {
  compareChatListRooms,
  compareUnifiedChatListItems,
  sortChatListRooms,
} from "@/lib/community-messenger/chat-list/chat-list-sorter";

function room(
  partial: Partial<{
    id: string;
    isPinned: boolean;
    unreadCount: number;
    lastMessageAt: string;
    title: string;
  }>
) {
  return {
    id: "room-a",
    isPinned: false,
    unreadCount: 0,
    lastMessageAt: "2026-06-01T00:00:00.000Z",
    title: "A",
    ...partial,
  };
}

describe("chat-list-sorter", () => {
  it("TEST 1: newer room ranks above older room regardless of unread", () => {
    const unreadOld = room({ id: "old", unreadCount: 10, lastMessageAt: "2026-06-01T00:00:00.000Z", title: "old" });
    const fresh = room({ id: "new", unreadCount: 0, lastMessageAt: "2026-06-10T00:00:00.000Z", title: "new" });
    expect(compareChatListRooms(fresh, unreadOld)).toBeLessThan(0);
    const sorted = sortChatListRooms([unreadOld, fresh]);
    expect(sorted.map((r) => r.id)).toEqual(["new", "old"]);
  });

  it("TEST 2: pinned room stays above regardless of time", () => {
    const sorted = sortChatListRooms([
      room({ id: "old", lastMessageAt: "2026-06-01T00:00:00.000Z", title: "old" }),
      room({ id: "pinned", isPinned: true, lastMessageAt: "2026-05-01T00:00:00.000Z", title: "pinned" }),
      room({ id: "newest", lastMessageAt: "2026-06-10T00:00:00.000Z", title: "newest" }),
    ]);
    expect(sorted.map((r) => r.title)).toEqual(["pinned", "newest", "old"]);
  });

  it("TEST 3: same timestamp uses stable room.id order", () => {
    const at = "2026-06-10T00:00:00.000Z";
    const a = room({ id: "aaa", lastMessageAt: at, title: "aaa" });
    const b = room({ id: "bbb", lastMessageAt: at, title: "bbb" });
    expect(compareChatListRooms(a, b)).toBeLessThan(0);
    expect(compareChatListRooms(b, a)).toBeGreaterThan(0);
    expect(sortChatListRooms([b, a]).map((r) => r.id)).toEqual(["aaa", "bbb"]);
  });

  it("compareUnifiedChatListItems uses lastEventAt with room.id tie-breaker", () => {
    const at = "2026-06-10T00:00:00.000Z";
    const a = { room: room({ id: "aaa", lastMessageAt: at }), lastEventAt: at };
    const b = { room: room({ id: "bbb", lastMessageAt: at }), lastEventAt: at };
    expect(compareUnifiedChatListItems(a, b)).toBeLessThan(0);
  });
});
