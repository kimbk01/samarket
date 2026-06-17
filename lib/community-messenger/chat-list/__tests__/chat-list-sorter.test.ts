import { describe, expect, it } from "vitest";
import { compareChatListRooms, sortChatListRooms } from "@/lib/community-messenger/chat-list/chat-list-sorter";

function room(
  partial: Partial<{
    isPinned: boolean;
    unreadCount: number;
    lastMessageAt: string;
    updatedAt: string;
    title: string;
  }>
) {
  return {
    isPinned: false,
    unreadCount: 0,
    lastMessageAt: "2026-06-01T00:00:00.000Z",
    updatedAt: "2026-06-01T00:00:00.000Z",
    title: "A",
    ...partial,
  };
}

describe("chat-list-sorter", () => {
  it("sorts pinned first, then unread, then lastMessageAt desc", () => {
    const sorted = sortChatListRooms([
      room({ title: "old", lastMessageAt: "2026-06-01T00:00:00.000Z" }),
      room({ title: "pinned", isPinned: true, lastMessageAt: "2026-05-01T00:00:00.000Z" }),
      room({ title: "unread", unreadCount: 2, lastMessageAt: "2026-05-15T00:00:00.000Z" }),
      room({ title: "newest", lastMessageAt: "2026-06-10T00:00:00.000Z" }),
    ]);
    expect(sorted.map((r) => r.title)).toEqual(["pinned", "unread", "newest", "old"]);
  });

  it("compareChatListRooms prefers unread over newer time", () => {
    const unread = room({ unreadCount: 1, lastMessageAt: "2026-06-01T00:00:00.000Z" });
    const newer = room({ unreadCount: 0, lastMessageAt: "2026-06-10T00:00:00.000Z" });
    expect(compareChatListRooms(unread, newer)).toBeLessThan(0);
  });
});
