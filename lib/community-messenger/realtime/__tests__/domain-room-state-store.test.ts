import { describe, expect, it, beforeEach, vi } from "vitest";
import {
  createEmptyDomainRoomStateSnapshot,
  reduceDomainRoomEvent,
  countUnreadRoomsByDomain,
  orderedDomainRooms,
} from "@/lib/community-messenger/realtime/reduce-domain-room-event";
import {
  dispatchDomainRoomEvent,
  resetDomainRoomStateStoreForTests,
  getDomainRoomStateSnapshot,
} from "@/lib/community-messenger/realtime/domain-room-state-store";
import {
  getProjectionAuthorityCounters,
  resetProjectionAuthorityForTests,
} from "@/lib/notifications/projection-authority";

describe("reduceDomainRoomEvent — Phase R spine", () => {
  it("message updates preview, order, and unread in one reduce", () => {
    let state = createEmptyDomainRoomStateSnapshot("u1");
    state = reduceDomainRoomEvent(state, {
      type: "snapshot",
      mode: "replace",
      rooms: [
        {
          roomId: "room-a",
          chatDomain: "general_direct",
          domainIdentityKey: "gd:a",
          previewText: "old",
          lastMessageAt: "2026-01-01T00:00:00.000Z",
          lastMessageType: "text",
          unreadCount: 0,
        },
        {
          roomId: "room-b",
          chatDomain: "group",
          domainIdentityKey: "g:b",
          previewText: "keep",
          lastMessageAt: "2026-01-02T00:00:00.000Z",
          lastMessageType: "text",
          unreadCount: 1,
        },
      ],
    });
    state = reduceDomainRoomEvent(state, {
      type: "message",
      roomId: "room-a",
      chatDomain: "general_direct",
      domainIdentityKey: "gd:a",
      messageId: "m1",
      previewText: "hello",
      lastMessageAt: "2026-01-03T00:00:00.000Z",
      lastMessageType: "text",
      boostUnread: true,
    });
    const ordered = orderedDomainRooms(state.rooms);
    expect(ordered[0]?.roomId).toBe("room-a");
    expect(ordered[0]?.previewText).toBe("hello");
    expect(ordered[0]?.unreadCount).toBe(1);
    expect(countUnreadRoomsByDomain(state.rooms)).toEqual({
      general_direct: 1,
      group: 1,
      trade: 0,
      store_order: 0,
    });
  });

  it("read zeros room unread in one reduce", () => {
    let state = createEmptyDomainRoomStateSnapshot("u1");
    state = reduceDomainRoomEvent(state, {
      type: "snapshot",
      mode: "replace",
      rooms: [
        {
          roomId: "room-a",
          chatDomain: "trade",
          domainIdentityKey: "t:a",
          previewText: "x",
          lastMessageAt: "2026-01-01T00:00:00.000Z",
          lastMessageType: "text",
          unreadCount: 3,
        },
      ],
    });
    state = reduceDomainRoomEvent(state, {
      type: "read",
      roomId: "room-a",
      chatDomain: "trade",
      domainIdentityKey: "t:a",
    });
    expect(state.rooms.get("room-a")?.unreadCount).toBe(0);
    expect(countUnreadRoomsByDomain(state.rooms).trade).toBe(0);
  });
});

describe("dispatchDomainRoomEvent — dedupe", () => {
  beforeEach(() => {
    resetDomainRoomStateStoreForTests();
    resetProjectionAuthorityForTests();
  });

  it("dedupes the same messageId", () => {
    dispatchDomainRoomEvent(
      {
        type: "message",
        roomId: "room-a",
        chatDomain: "general_direct",
        domainIdentityKey: "gd:a",
        messageId: "m1",
        previewText: "a",
        lastMessageAt: "2026-01-01T00:00:00.000Z",
        lastMessageType: "text",
        boostUnread: true,
      },
      { applySurfaces: false, mirrorListCache: false }
    );
    dispatchDomainRoomEvent(
      {
        type: "message",
        roomId: "room-a",
        chatDomain: "general_direct",
        domainIdentityKey: "gd:a",
        messageId: "m1",
        previewText: "b",
        lastMessageAt: "2026-01-02T00:00:00.000Z",
        lastMessageType: "text",
        boostUnread: true,
      },
      { applySurfaces: false, mirrorListCache: false }
    );
    expect(getDomainRoomStateSnapshot().rooms.get("room-a")?.previewText).toBe("a");
    expect(getDomainRoomStateSnapshot().rooms.get("room-a")?.unreadCount).toBe(1);
  });

  it("P0: applySurfaces without complete snapshot rejects incomplete commit (no surface invent)", async () => {
    vi.stubGlobal("window", {
      dispatchEvent: vi.fn(),
    });
    resetProjectionAuthorityForTests();
    dispatchDomainRoomEvent(
      {
        type: "message",
        roomId: "room-a",
        chatDomain: "general_direct",
        domainIdentityKey: "gd:a",
        messageId: "m2",
        previewText: "hi",
        lastMessageAt: "2026-01-01T00:00:00.000Z",
        lastMessageType: "text",
        boostUnread: true,
      },
      { applySurfaces: true, mirrorListCache: false }
    );
    expect(getDomainRoomStateSnapshot().rooms.get("room-a")?.unreadCount).toBe(1);
    await vi.waitFor(() => {
      expect(getProjectionAuthorityCounters().incomplete_commit_rejected).toBeGreaterThan(0);
    });
    expect(getProjectionAuthorityCounters().projection_commit_ok).toBe(0);
    vi.unstubAllGlobals();
  });
});
