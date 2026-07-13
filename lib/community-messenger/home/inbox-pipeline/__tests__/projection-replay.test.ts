import { describe, expect, it } from "vitest";
import { buildMessengerHomeProjection } from "@/lib/community-messenger/home/inbox-pipeline/projection";
import {
  createMessengerHomeCanonicalState,
  reduceMessengerHomeRoomEvent,
} from "@/lib/community-messenger/home/inbox-pipeline/reducer";
import type {
  CanonicalMessengerHomeRoom,
  CanonicalMessengerHomeRoomPatch,
  MessengerHomeCanonicalState,
  MessengerHomeRoomEvent,
  MessengerHomeSource,
} from "@/lib/community-messenger/home/inbox-pipeline/types";

function room(extra: Partial<CanonicalMessengerHomeRoom> = {}): CanonicalMessengerHomeRoom {
  return {
    roomId: "r1",
    roomType: "direct",
    directKey: null,
    contextMeta: null,
    title: "room",
    avatarUrl: null,
    latestMessage: "hello",
    lastMessageAt: "2026-07-13T00:00:00.000Z",
    unreadCount: 0,
    isArchived: false,
    isBlockedHidden: false,
    roomStatus: "active",
    memberCount: 2,
    ...extra,
  };
}

function patch(roomId: string, extra: Partial<CanonicalMessengerHomeRoomPatch> = {}): CanonicalMessengerHomeRoomPatch {
  return {
    roomId,
    roomType: "direct",
    directKey: null,
    contextMeta: null,
    title: roomId,
    avatarUrl: null,
    latestMessage: "hello",
    lastMessageAt: "2026-07-13T00:00:00.000Z",
    unreadCount: 0,
    isArchived: false,
    isBlockedHidden: false,
    roomStatus: "active",
    memberCount: 2,
    ...extra,
  };
}

function event(source: MessengerHomeSource, generation: number, patch: CanonicalMessengerHomeRoomPatch): MessengerHomeRoomEvent {
  return { source, generation, roomId: patch.roomId, patch };
}

function replay(events: MessengerHomeRoomEvent[]): MessengerHomeCanonicalState {
  return events.reduce(reduceMessengerHomeRoomEvent, createMessengerHomeCanonicalState());
}

function result(state: MessengerHomeCanonicalState, roomId = "trade-room") {
  const projection = buildMessengerHomeProjection(state.rooms.values(), "viewer", {
    nowMs: Date.parse("2026-07-13T00:00:00.000Z"),
  });
  return {
    bucket: projection.bucketByRoomId.get(roomId),
    tradeIds: projection.tradeRoomIds,
    contextKind: state.rooms.get(roomId)?.contextMeta?.kind ?? null,
    lastMessageAt: state.rooms.get(roomId)?.lastMessageAt,
    unreadCount: state.rooms.get(roomId)?.unreadCount,
  };
}

describe("canonical inbox projection and replay", () => {
  it("dedupes trade rooms by existing canonical key and keeps latest representative", () => {
    const projection = buildMessengerHomeProjection(
      [
        room({
          roomId: "older",
          directKey: "trade_pc:pc-1",
          contextMeta: { v: 1, kind: "trade", productChatId: "pc-1" },
          lastMessageAt: "2026-07-13T00:00:00.000Z",
        }),
        room({
          roomId: "newer",
          directKey: "trade_pc:pc-1",
          contextMeta: { v: 1, kind: "trade", productChatId: "pc-1" },
          lastMessageAt: "2026-07-13T00:05:00.000Z",
        }),
      ],
      "viewer"
    );
    expect(projection.tradeRoomIds).toEqual(["newer"]);
  });

  it("projects direct and group rooms into inbox", () => {
    const projection = buildMessengerHomeProjection(
      [
        room({ roomId: "direct-1", directKey: "a:b" }),
        room({ roomId: "group-1", roomType: "private_group", memberCount: 3 }),
      ],
      "viewer"
    );
    expect(new Set(projection.inboxRoomIds)).toEqual(new Set(["direct-1", "group-1"]));
  });

  it("keeps final result stable for critical/lite/full order permutations", () => {
    const critical = event("critical", 1, patch("trade-room", {
      contextMeta: { v: 1, kind: "trade", productChatId: "pc-1" },
      unreadCount: 1,
    }));
    const lite = event("lite", 1, { roomId: "trade-room", unreadCount: 0 });
    const full = event("full", 1, patch("trade-room", {
      contextMeta: { v: 1, kind: "trade", productChatId: "pc-1", buyerId: "buyer" },
      unreadCount: 2,
    }));

    expect(result(replay([critical, lite, full]))).toMatchObject({
      bucket: "trade",
      contextKind: "trade",
      unreadCount: 2,
    });
    expect(result(replay([lite, critical, full]))).toMatchObject({
      bucket: "trade",
      contextKind: "trade",
      unreadCount: 2,
    });
  });

  it("keeps cache/critical/home-sync sequence from regressing domain metadata", () => {
    const cache = event("cache", 1, patch("trade-room", {
      contextMeta: { v: 1, kind: "trade", productChatId: "pc-1" },
      unreadCount: 4,
    }));
    const critical = event("critical", 1, { roomId: "trade-room", contextMeta: null, unreadCount: 0 });
    const sync = event("home_sync", 1, { roomId: "trade-room", contextMeta: { v: 1, kind: "trade", productChatId: "pc-1" } });

    expect(result(replay([cache, critical, sync]))).toMatchObject({
      bucket: "trade",
      contextKind: "trade",
      unreadCount: 4,
    });
  });

  it("keeps realtime latest message over stale home-sync", () => {
    const full = event("full", 1, patch("trade-room", { unreadCount: 1 }));
    const realtime = event("realtime", 1, {
      roomId: "trade-room",
      latestMessage: "new",
      lastMessageAt: "2026-07-13T00:10:00.000Z",
      unreadCount: 2,
    });
    const staleSync = event("home_sync", 1, {
      roomId: "trade-room",
      latestMessage: "old",
      lastMessageAt: "2026-07-13T00:01:00.000Z",
      unreadCount: 2,
    });
    expect(result(replay([full, realtime, staleSync]))).toMatchObject({
      lastMessageAt: "2026-07-13T00:10:00.000Z",
      unreadCount: 2,
    });
  });

  it("merges realtime first and full later without losing the latest event", () => {
    const realtimeFirst = event("realtime", 1, patch("trade-room", {
      latestMessage: "new",
      lastMessageAt: "2026-07-13T00:10:00.000Z",
      unreadCount: 2,
    }));
    const fullLater = event("full", 1, patch("trade-room", {
      contextMeta: { v: 1, kind: "trade", productChatId: "pc-1" },
      latestMessage: "old",
      lastMessageAt: "2026-07-13T00:00:00.000Z",
      unreadCount: 2,
    }));
    expect(result(replay([realtimeFirst, fullLater]))).toMatchObject({
      bucket: "trade",
      contextKind: "trade",
      lastMessageAt: "2026-07-13T00:10:00.000Z",
    });
  });
});
