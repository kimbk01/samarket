import { beforeEach, describe, expect, it, vi } from "vitest";
import {
  clearBootstrapCache,
  peekBootstrapCache,
  primeBootstrapCache,
} from "@/lib/community-messenger/bootstrap-cache";
import {
  applyBootstrapCacheBusEvent,
  BOOTSTRAP_CACHE_SYNC_HOST_WRITER_ID,
  clearBootstrapCacheBusWriterStateForTests,
  getBootstrapCacheWriteCountForTests,
  noteBootstrapCacheBusWriterViewerUserId,
} from "@/lib/community-messenger/home/bootstrap-cache-bus-writer";
import {
  buildCommunityMessengerBusEventId,
  clearCommunityMessengerBusLocalHandlersForTests,
  onCommunityMessengerBusEvent,
  postCommunityMessengerBusEvent,
  type MessengerBusEvent,
} from "@/lib/community-messenger/multi-tab-bus";
import type { CommunityMessengerBootstrap, CommunityMessengerRoomSummary } from "@/lib/community-messenger/types";

function room(
  partial: Partial<CommunityMessengerRoomSummary> & Pick<CommunityMessengerRoomSummary, "id">
): CommunityMessengerRoomSummary {
  const { id, ...rest } = partial;
  return {
    id,
    roomType: "direct",
    roomStatus: "active",
    visibility: "private",
    joinPolicy: "invite_only",
    identityPolicy: "real_name",
    isReadonly: false,
    title: "Peer",
    subtitle: "",
    summary: "",
    avatarUrl: null,
    unreadCount: 0,
    lastMessage: "",
    lastMessageAt: "2026-01-01T00:00:00.000Z",
    memberCount: 2,
    ownerUserId: null,
    ownerLabel: "",
    memberLimit: null,
    isDiscoverable: false,
    requiresPassword: false,
    allowMemberInvite: false,
    ...rest,
  };
}

function bootstrap(chats: CommunityMessengerRoomSummary[]): CommunityMessengerBootstrap {
  return {
    me: { id: "user-a" },
    tabs: { chats: chats.length, groups: 0, calls: 0, friends: 0 },
    chats,
    groups: [],
    friends: [],
    following: [],
    hidden: [],
    blocked: [],
    discoverableGroups: [],
    requests: [],
    calls: [],
  } as unknown as CommunityMessengerBootstrap;
}

describe("bootstrap-cache-bus-writer", () => {
  beforeEach(() => {
    clearBootstrapCache();
    clearBootstrapCacheBusWriterStateForTests();
    clearCommunityMessengerBusLocalHandlersForTests();
    noteBootstrapCacheBusWriterViewerUserId("user-a");
  });

  it("TEST 1: message_sent updates bootstrap cache lastMessageAt without Home mounted", () => {
    primeBootstrapCache(
      bootstrap([
        room({ id: "room-a", lastMessage: "old", lastMessageAt: "2026-06-01T00:00:00.000Z" }),
        room({ id: "room-b", lastMessage: "other", lastMessageAt: "2026-06-10T00:00:00.000Z" }),
      ])
    );
    const ev: MessengerBusEvent = {
      type: "cm.room.message_sent",
      roomId: "room-a",
      senderUserId: "user-a",
      clientMessageId: "c1",
      at: 1,
      listPreview: {
        lastMessage: "hello",
        lastMessageType: "text",
        lastMessageAt: "2026-06-15T12:00:00.000Z",
      },
    };
    const result = applyBootstrapCacheBusEvent(ev, "user-a");
    expect(result.cacheWriteApplied).toBe(true);
    expect(peekBootstrapCache()?.chats?.find((r) => r.id === "room-a")?.lastMessageAt).toBe(
      "2026-06-15T12:00:00.000Z"
    );
    expect(peekBootstrapCache()?.chats?.[0]?.id).toBe("room-a");
  });

  it("TEST 2: call_stub_preview updates preview only for same session timestamp", () => {
    const startedAt = "2026-06-09T10:00:00.000Z";
    primeBootstrapCache(
      bootstrap([
        room({
          id: "room-1",
          lastMessage: "발신 중",
          lastMessageAt: startedAt,
          lastMessageType: "call_stub",
        }),
      ])
    );
    const ev: MessengerBusEvent = {
      type: "cm.room.call_stub_preview",
      roomId: "room-1",
      viewerUserId: "user-a",
      at: 2,
      preview: {
        lastMessage: "취소된 통화",
        lastMessageType: "call_stub",
        lastMessageAt: startedAt,
      },
    };
    const result = applyBootstrapCacheBusEvent(ev, "user-a");
    expect(result.cacheWriteApplied).toBe(true);
    const row = peekBootstrapCache()?.chats?.[0];
    expect(row?.lastMessage).toBe("취소된 통화");
    expect(row?.lastMessageAt).toBe(startedAt);
  });

  it("TEST 3: terminal preview does not overwrite newer text preview", () => {
    const callStart = "2026-06-09T10:00:00.000Z";
    const textAt = "2026-06-09T10:00:05.000Z";
    primeBootstrapCache(
      bootstrap([
        room({
          id: "room-1",
          lastMessage: "안녕",
          lastMessageAt: textAt,
          lastMessageType: "text",
        }),
      ])
    );
    const ev: MessengerBusEvent = {
      type: "cm.room.call_stub_preview",
      roomId: "room-1",
      viewerUserId: "user-a",
      at: 3,
      preview: {
        lastMessage: "통화 종료",
        lastMessageType: "call_stub",
        lastMessageAt: callStart,
      },
    };
    const result = applyBootstrapCacheBusEvent(ev, "user-a");
    expect(result.cacheWriteApplied).toBe(false);
    expect(result.cacheWriteSkipReason).toBe("call_stub_preview_guard");
    expect(peekBootstrapCache()?.chats?.[0]?.lastMessage).toBe("안녕");
  });

  it("TEST 4: duplicate local + transport eventId writes cache once", () => {
    primeBootstrapCache(bootstrap([room({ id: "room-a", lastMessageAt: "2026-06-01T00:00:00.000Z" })]));
    const ev: MessengerBusEvent = {
      type: "cm.room.message_sent",
      roomId: "room-a",
      senderUserId: "user-a",
      clientMessageId: "dup-1",
      at: 10,
      listPreview: {
        lastMessage: "once",
        lastMessageType: "text",
        lastMessageAt: "2026-06-20T00:00:00.000Z",
      },
    };
    const first = applyBootstrapCacheBusEvent(ev, "user-a");
    const second = applyBootstrapCacheBusEvent(ev, "user-a");
    expect(first.cacheWriteApplied).toBe(true);
    expect(second.cacheWriteApplied).toBe(false);
    expect(second.cacheWriteSkipReason).toBe("duplicate_event_id");
    expect(getBootstrapCacheWriteCountForTests()).toBe(1);
  });

  it("TEST 5: stale message event does not overwrite newer cache", () => {
    primeBootstrapCache(
      bootstrap([room({ id: "room-a", lastMessage: "new", lastMessageAt: "2026-06-20T00:00:00.000Z" })])
    );
    const ev: MessengerBusEvent = {
      type: "cm.room.message_sent",
      roomId: "room-a",
      senderUserId: "user-a",
      at: 11,
      listPreview: {
        lastMessage: "old",
        lastMessageType: "text",
        lastMessageAt: "2026-06-01T00:00:00.000Z",
      },
    };
    const result = applyBootstrapCacheBusEvent(ev, "user-a");
    expect(result.cacheWriteApplied).toBe(false);
    expect(result.cacheWriteSkipReason).toBe("stale_last_message_at");
    expect(peekBootstrapCache()?.chats?.[0]?.lastMessage).toBe("new");
  });

  it("TEST 6: host writer id is stable and second writer pass dedupes", () => {
    primeBootstrapCache(bootstrap([room({ id: "room-a" })]));
    const ev: MessengerBusEvent = {
      type: "cm.room.message_sent",
      roomId: "room-a",
      senderUserId: "user-a",
      at: 12,
      listPreview: {
        lastMessage: "x",
        lastMessageType: "text",
        lastMessageAt: "2026-06-21T00:00:00.000Z",
      },
    };
    applyBootstrapCacheBusEvent(ev, "user-a", BOOTSTRAP_CACHE_SYNC_HOST_WRITER_ID);
    const again = applyBootstrapCacheBusEvent(ev, "user-a", "home-hook-should-not-write");
    expect(again.cacheWriteSkipReason).toBe("duplicate_event_id");
    expect(getBootstrapCacheWriteCountForTests()).toBe(1);
  });

  it("TEST 7: preview-only patch keeps sort order", () => {
    const startedAt = "2026-06-01T00:00:00.000Z";
    primeBootstrapCache(
      bootstrap([
        room({
          id: "room-new",
          lastMessage: "text",
          lastMessageAt: "2026-06-10T00:00:00.000Z",
          lastMessageType: "text",
        }),
        room({
          id: "room-old",
          lastMessage: "발신 중",
          lastMessageAt: startedAt,
          lastMessageType: "call_stub",
        }),
      ])
    );
    applyBootstrapCacheBusEvent(
      {
        type: "cm.room.call_stub_preview",
        roomId: "room-old",
        viewerUserId: "user-a",
        at: 13,
        preview: {
          lastMessage: "부재중",
          lastMessageType: "call_stub",
          lastMessageAt: startedAt,
        },
      },
      "user-a"
    );
    expect(peekBootstrapCache()?.chats?.map((r) => r.id)).toEqual(["room-new", "room-old"]);
    expect(peekBootstrapCache()?.chats?.[1]?.lastMessage).toBe("부재중");
  });

  it("TEST 8: user A event does not modify user B cache writer scope", () => {
    noteBootstrapCacheBusWriterViewerUserId("user-b");
    primeBootstrapCache(
      bootstrap([room({ id: "room-a", lastMessage: "keep", lastMessageAt: "2026-06-01T00:00:00.000Z" })])
    );
    const result = applyBootstrapCacheBusEvent(
      {
        type: "cm.room.message_sent",
        roomId: "room-a",
        senderUserId: "user-a",
        at: 14,
        listPreview: {
          lastMessage: "hack",
          lastMessageType: "text",
          lastMessageAt: "2026-06-30T00:00:00.000Z",
        },
      },
      "user-a"
    );
    expect(result.cacheWriteSkipReason).toBe("viewer_user_mismatch");
    expect(peekBootstrapCache()?.chats?.[0]?.lastMessage).toBe("keep");
  });

  it("TEST 11: call start then terminal keeps startedAt sort key", () => {
    const startedAt = "2026-06-09T10:00:00.000Z";
    primeBootstrapCache(
      bootstrap([room({ id: "room-1", lastMessage: "old", lastMessageAt: "2026-06-01T00:00:00.000Z" })])
    );
    applyBootstrapCacheBusEvent(
      {
        type: "cm.room.message_sent",
        roomId: "room-1",
        senderUserId: "user-a",
        at: 15,
        listPreview: {
          lastMessage: "발신 중",
          lastMessageType: "call_stub",
          lastMessageAt: startedAt,
        },
      },
      "user-a"
    );
    expect(peekBootstrapCache()?.chats?.[0]?.lastMessageAt).toBe(startedAt);
    applyBootstrapCacheBusEvent(
      {
        type: "cm.room.call_stub_preview",
        roomId: "room-1",
        viewerUserId: "user-a",
        at: 16,
        preview: {
          lastMessage: "취소됨",
          lastMessageType: "call_stub",
          lastMessageAt: startedAt,
        },
      },
      "user-a"
    );
    expect(peekBootstrapCache()?.chats?.[0]?.lastMessageAt).toBe(startedAt);
    expect(peekBootstrapCache()?.chats?.[0]?.lastMessage).toBe("취소됨");
  });
});

describe("multi-tab bus local dispatch", () => {
  beforeEach(() => {
    clearCommunityMessengerBusLocalHandlersForTests();
  });

  it("delivers posted events to same-tab listeners via local fanout", () => {
    const seen: string[] = [];
    const off = onCommunityMessengerBusEvent((ev) => {
      if (ev.type === "cm.room.message_sent") seen.push(ev.roomId);
    });
    postCommunityMessengerBusEvent({
      type: "cm.room.message_sent",
      roomId: "room-local",
      senderUserId: "user-a",
      at: Date.now(),
    });
    off();
    expect(seen).toEqual(["room-local"]);
  });

  it("buildCommunityMessengerBusEventId is stable for duplicate detection", () => {
    const ev: MessengerBusEvent = {
      type: "cm.room.message_sent",
      roomId: "r1",
      senderUserId: "u1",
      clientMessageId: "m1",
      at: 99,
      listPreview: {
        lastMessage: "hi",
        lastMessageType: "text",
        lastMessageAt: "2026-06-01T00:00:00.000Z",
      },
    };
    expect(buildCommunityMessengerBusEventId(ev)).toBe(buildCommunityMessengerBusEventId(ev));
  });
});

describe("render pause bypass", () => {
  it("TEST 9: sender_local_echo schedule bypasses render pause gate", async () => {
    vi.stubGlobal("requestAnimationFrame", (cb: FrameRequestCallback) => {
      cb(0);
      return 1;
    });
    vi.resetModules();
    const pause = await import("@/lib/community-messenger/room/cm-room-list-render-pause");
    pause.beginCmRoomListRenderPause("room-entry");
    const { createCmHomeListRafPatchScheduler } = await import(
      "@/lib/community-messenger/dev/cm-raf-home-list-patch"
    );
    let applied = false;
    const schedule = createCmHomeListRafPatchScheduler(() => {
      applied = true;
      return null;
    });
    schedule(() => null, "bus");
    expect(applied).toBe(false);
    schedule(() => null, "bus", { bypassRenderPause: true });
    expect(applied).toBe(true);
    pause.endCmRoomListRenderPause("room_unmount");
    vi.unstubAllGlobals();
  });

  it("TEST 10: default bus patch stays deferred while pause active", async () => {
    vi.stubGlobal("requestAnimationFrame", (cb: FrameRequestCallback) => {
      cb(0);
      return 1;
    });
    vi.resetModules();
    const pause = await import("@/lib/community-messenger/room/cm-room-list-render-pause");
    pause.beginCmRoomListRenderPause("room-entry");
    const { createCmHomeListRafPatchScheduler } = await import(
      "@/lib/community-messenger/dev/cm-raf-home-list-patch"
    );
    let applied = false;
    const schedule = createCmHomeListRafPatchScheduler(() => {
      applied = true;
      return null;
    });
    schedule(() => null, "bootstrap");
    expect(applied).toBe(false);
    pause.endCmRoomListRenderPause("duration");
    expect(applied).toBe(true);
    vi.unstubAllGlobals();
  });
});
