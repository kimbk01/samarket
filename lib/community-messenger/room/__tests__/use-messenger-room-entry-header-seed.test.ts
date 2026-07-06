import { beforeEach, describe, expect, it, vi } from "vitest";
import {
  __resetMessengerRoomEntryHeaderSeedCacheForTest,
  readMessengerRoomEntryHeaderSeed,
  releaseMessengerRoomEntryHeaderSeedCache,
} from "@/lib/community-messenger/room/use-messenger-room-entry-header-seed";
import {
  clearRoomEntryIntent,
  markRoomEntryIntent,
} from "@/lib/community-messenger/room/messenger-room-entry-intent";

const ROOM = "room-header-seed-bridge-001";
const sessionStore = new Map<string, string>();

describe("use-messenger-room-entry-header-seed", () => {
  beforeEach(() => {
    sessionStore.clear();
    __resetMessengerRoomEntryHeaderSeedCacheForTest();
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

  it("reads list tap seed from room entry intent", () => {
    markRoomEntryIntent(ROOM, { title: "q테스트1 (@qqqq)", avatarUrl: "https://cdn.example/a.png" });
    expect(readMessengerRoomEntryHeaderSeed(ROOM)).toEqual({
      title: "q테스트1 (@qqqq)",
      avatarUrl: "https://cdn.example/a.png",
    });
  });

  it("keeps sticky seed after clearRoomEntryIntent (handoff)", () => {
    markRoomEntryIntent(ROOM, { title: "메인관리자 (@aaaa)", avatarUrl: null });
    expect(readMessengerRoomEntryHeaderSeed(ROOM)?.title).toBe("메인관리자 (@aaaa)");
    clearRoomEntryIntent(ROOM);
    expect(readMessengerRoomEntryHeaderSeed(ROOM)?.title).toBe("메인관리자 (@aaaa)");
  });

  it("returns null when no seed and no cache (direct URL)", () => {
    expect(readMessengerRoomEntryHeaderSeed(ROOM)).toBeNull();
  });

  it("releaseMessengerRoomEntryHeaderSeedCache drops sticky row", () => {
    markRoomEntryIntent(ROOM, { title: "cached", avatarUrl: null });
    readMessengerRoomEntryHeaderSeed(ROOM);
    clearRoomEntryIntent(ROOM);
    releaseMessengerRoomEntryHeaderSeedCache(ROOM);
    expect(readMessengerRoomEntryHeaderSeed(ROOM)).toBeNull();
  });
});
