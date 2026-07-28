import { beforeEach, describe, expect, it, vi } from "vitest";
import {
  __resetMessengerPushEntryIntentForTest,
  appendMessengerPushEntryQuery,
  clearRoomEntryIntent,
  consumeMessengerRoomEntryIntent,
  getRoomEntryIntent,
  isRoomEntryInFlight,
  markMessengerPushEntryIntent,
  markRoomEntryIntent,
  parseMessengerRoomIdFromAppPath,
  resolveMessengerRoomEntryScrollPlan,
} from "@/lib/community-messenger/room/messenger-room-entry-intent";

const ROOM = "room-push-test-001";
const sessionStore = new Map<string, string>();

describe("messenger-room-entry-intent", () => {
  beforeEach(() => {
    sessionStore.clear();
    __resetMessengerPushEntryIntentForTest();
    clearRoomEntryIntent();
    vi.stubGlobal("window", { location: { search: "" } });
    vi.stubGlobal("sessionStorage", {
      getItem: (key: string) => sessionStore.get(key) ?? null,
      setItem: (key: string, value: string) => {
        sessionStore.set(key, value);
      },
      removeItem: (key: string) => {
        sessionStore.delete(key);
      },
    });
  });

  it("parses CM and trade room paths", () => {
    expect(parseMessengerRoomIdFromAppPath("/community-messenger/rooms/abc-123")).toBe("abc-123");
    expect(parseMessengerRoomIdFromAppPath("/chats/trade-room-9?foo=1")).toBe("trade-room-9");
    expect(parseMessengerRoomIdFromAppPath("/market")).toBeNull();
  });

  it("push + hasPersisted → push_entry_initial_load, clearPersist", () => {
    expect(
      resolveMessengerRoomEntryScrollPlan({ intent: "push", hasPersisted: true })
    ).toEqual({
      reason: "push_entry_initial_load",
      clearPersist: true,
      forceBottom: true,
    });
  });

  it("default + hasPersisted → still latest bottom (persist must not override Enter)", () => {
    expect(
      resolveMessengerRoomEntryScrollPlan({ intent: "default", hasPersisted: true })
    ).toEqual({
      reason: "initial_load",
      clearPersist: true,
      forceBottom: true,
      anchorMessageId: null,
    });
  });

  it("default + no persist → initial_load", () => {
    expect(
      resolveMessengerRoomEntryScrollPlan({ intent: "default", hasPersisted: false })
    ).toEqual({
      reason: "initial_load",
      clearPersist: true,
      forceBottom: true,
      anchorMessageId: null,
    });
  });

  it("unread + firstUnread → restore with firstUnread anchor (not lastRead)", () => {
    expect(
      resolveMessengerRoomEntryScrollPlan({
        intent: "default",
        hasPersisted: true,
        unreadCount: 4,
        lastReadMessageId: "lr-1",
        firstUnreadMessageId: "fu-1",
      })
    ).toEqual({
      reason: "room_entry_restore",
      clearPersist: true,
      forceBottom: false,
      anchorMessageId: "fu-1",
    });
  });

  it("unread without firstUnread → not force bottom (no fake lastRead)", () => {
    expect(
      resolveMessengerRoomEntryScrollPlan({
        intent: "default",
        hasPersisted: false,
        unreadCount: 2,
        lastReadMessageId: "lr-1",
        firstUnreadMessageId: null,
      })
    ).toEqual({
      reason: "room_entry_restore",
      clearPersist: true,
      forceBottom: false,
      anchorMessageId: null,
    });
  });

  it("consumes session flag for matching room", () => {
    markMessengerPushEntryIntent(ROOM);
    expect(consumeMessengerRoomEntryIntent(ROOM)).toBe("push");
    expect(consumeMessengerRoomEntryIntent(ROOM)).toBe("default");
  });

  it("consumes ?entry=push query", () => {
    expect(consumeMessengerRoomEntryIntent(ROOM, "?entry=push")).toBe("push");
  });

  it("appends entry=push query preserving existing params", () => {
    expect(appendMessengerPushEntryQuery("/chats/r1?foo=bar")).toBe(
      "/chats/r1?foo=bar&entry=push"
    );
  });

  it("list tap room entry intent — mark, get, in-flight, clear", () => {
    markRoomEntryIntent(ROOM, { title: "Test Room" });
    expect(isRoomEntryInFlight()).toBe(true);
    expect(isRoomEntryInFlight(ROOM)).toBe(true);
    expect(getRoomEntryIntent(ROOM)?.seed?.title).toBe("Test Room");
    clearRoomEntryIntent(ROOM);
    expect(isRoomEntryInFlight()).toBe(false);
    expect(getRoomEntryIntent(ROOM)).toBeNull();
  });
});
