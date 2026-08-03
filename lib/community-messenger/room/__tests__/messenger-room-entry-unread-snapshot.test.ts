import { describe, expect, it, beforeEach } from "vitest";
import {
  __resetMessengerRoomEntryUnreadStoreForTest,
  captureMessengerRoomEntryUnread,
  clearMessengerRoomEntryUnread,
  peekMessengerRoomEntryFirstUnreadId,
  peekMessengerRoomEntryUnreadCount,
  useMessengerRoomEntryUnreadStore,
} from "@/lib/community-messenger/room/messenger-room-entry-unread-snapshot";
import {
  formatUnreadBadgeCount,
  resolveFirstUnreadMessageId,
  resolveJumpToLatestFabState,
} from "@/lib/community-messenger/room/messenger-room-first-unread";

describe("messenger-room-entry-unread-snapshot", () => {
  beforeEach(() => {
    __resetMessengerRoomEntryUnreadStoreForTest();
  });

  it("captures entry count and first-unread anchor after list projection changes", () => {
    captureMessengerRoomEntryUnread({ roomId: "r1", unreadCount: 3, firstUnreadMessageId: "m3" });
    expect(peekMessengerRoomEntryUnreadCount("r1")).toBe(3);
    expect(peekMessengerRoomEntryFirstUnreadId("r1")).toBe("m3");
    /** Simulate optimistic list clear — capture(0) must not wipe snapshot */
    expect(captureMessengerRoomEntryUnread({ roomId: "r1", unreadCount: 0 })).toBeNull();
    expect(peekMessengerRoomEntryUnreadCount("r1")).toBe(3);
  });

  it("does not recreate while active; can fill firstUnread later", () => {
    captureMessengerRoomEntryUnread({ roomId: "r1", unreadCount: 5 });
    captureMessengerRoomEntryUnread({ roomId: "r1", unreadCount: 99 });
    expect(peekMessengerRoomEntryUnreadCount("r1")).toBe(5);
    captureMessengerRoomEntryUnread({
      roomId: "r1",
      unreadCount: 0,
      firstUnreadMessageId: "fu-1",
    });
    expect(peekMessengerRoomEntryFirstUnreadId("r1")).toBe("fu-1");
    expect(peekMessengerRoomEntryUnreadCount("r1")).toBe(5);
  });

  it("clear removes entry snapshot count; other room untouched", () => {
    captureMessengerRoomEntryUnread({ roomId: "r1", unreadCount: 3 });
    captureMessengerRoomEntryUnread({ roomId: "r2", unreadCount: 7 });
    clearMessengerRoomEntryUnread("r1", "reached_latest");
    expect(peekMessengerRoomEntryUnreadCount("r1")).toBe(0);
    expect(peekMessengerRoomEntryUnreadCount("r2")).toBe(7);
  });

  it("FAB state uses remaining unread, not the entry snapshot", () => {
    expect(resolveJumpToLatestFabState({ atLatest: true, remainingUnreadCount: 3 })).toEqual({
      visible: true,
      badgeCount: 3,
    });
    expect(resolveJumpToLatestFabState({ atLatest: true, remainingUnreadCount: 0 })).toEqual({
      visible: false,
      badgeCount: 0,
    });
    expect(resolveJumpToLatestFabState({ atLatest: false, remainingUnreadCount: 0 })).toEqual({
      visible: true,
      badgeCount: 0,
    });
    expect(formatUnreadBadgeCount(100)).toBe("99+");
  });

  it("first unread is message after lastRead (not lastRead itself)", () => {
    expect(
      resolveFirstUnreadMessageId({
        messages: [
          { id: "a", isMine: false },
          { id: "b", isMine: true },
          { id: "c", isMine: false },
        ],
        lastReadMessageId: "b",
      })
    ).toBe("c");
  });

  it("store byRoom isolation", () => {
    captureMessengerRoomEntryUnread({ roomId: "a", unreadCount: 1 });
    expect(useMessengerRoomEntryUnreadStore.getState().byRoom.b).toBeUndefined();
  });
});
