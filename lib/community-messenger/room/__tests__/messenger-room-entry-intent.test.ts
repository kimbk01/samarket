import { beforeEach, describe, expect, it, vi } from "vitest";
import {
  __resetMessengerPushEntryIntentForTest,
  appendMessengerPushEntryQuery,
  consumeMessengerRoomEntryIntent,
  markMessengerPushEntryIntent,
  parseMessengerRoomIdFromAppPath,
  resolveMessengerRoomEntryScrollPlan,
} from "@/lib/community-messenger/room/messenger-room-entry-intent";

const ROOM = "room-push-test-001";
const sessionStore = new Map<string, string>();

describe("messenger-room-entry-intent", () => {
  beforeEach(() => {
    sessionStore.clear();
    __resetMessengerPushEntryIntentForTest();
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

  it("default + hasPersisted → room_entry_restore", () => {
    expect(
      resolveMessengerRoomEntryScrollPlan({ intent: "default", hasPersisted: true })
    ).toEqual({
      reason: "room_entry_restore",
      clearPersist: false,
      forceBottom: false,
    });
  });

  it("default + no persist → initial_load", () => {
    expect(
      resolveMessengerRoomEntryScrollPlan({ intent: "default", hasPersisted: false })
    ).toEqual({
      reason: "initial_load",
      clearPersist: false,
      forceBottom: true,
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
});
