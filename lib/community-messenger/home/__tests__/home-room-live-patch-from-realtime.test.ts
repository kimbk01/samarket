import { describe, expect, it } from "vitest";
import { applyHomeListPatch } from "@/lib/community-messenger/home-list-patch";
import {
  normalizeHomeMessageUpdateLivePatch,
  normalizeHomeRoomTipUpdateLivePatch,
  patchBootstrapRoomListForRealtimeMessageUpdate,
  patchBootstrapRoomListForRoomTipUpdate,
} from "@/lib/community-messenger/home/home-room-live-patch-from-realtime";
import { patchBootstrapRoomListForRealtimeMessageInsert } from "@/lib/community-messenger/home/patch-bootstrap-room-list-from-realtime-message";
import type { CommunityMessengerBootstrap, CommunityMessengerRoomSummary } from "@/lib/community-messenger/types";

function room(partial: Partial<CommunityMessengerRoomSummary> & { id: string }): CommunityMessengerRoomSummary {
  return {
    id: partial.id,
    title: partial.title ?? partial.id,
    roomType: partial.roomType ?? "direct",
    isPinned: partial.isPinned ?? false,
    unreadCount: partial.unreadCount ?? 0,
    lastMessage: partial.lastMessage ?? "",
    lastMessageAt: partial.lastMessageAt ?? "2026-01-01T00:00:00.000Z",
    lastMessageType: partial.lastMessageType ?? "text",
  } as CommunityMessengerRoomSummary;
}

function bootstrap(rooms: CommunityMessengerRoomSummary[]): CommunityMessengerBootstrap {
  return {
    chats: rooms,
    groups: [],
    calls: [],
    friends: [],
    requests: [],
    me: { id: "me" },
    tabs: { chats: rooms.length, groups: 0, calls: 0, friends: 0 },
  } as unknown as CommunityMessengerBootstrap;
}

describe("home room live tip patch (hydrated UPDATE path)", () => {
  const startedAt = "2026-07-28T10:00:00.000Z";

  it("hydrated call_stub dialing→terminal UPDATE patches preview without silent refresh", () => {
    const data = bootstrap([
      room({ id: "room-a", lastMessage: "hello", lastMessageAt: "2026-07-27T00:00:00.000Z" }),
      room({
        id: "room-b",
        lastMessage: "발신 중",
        lastMessageAt: startedAt,
        lastMessageType: "call_stub",
      }),
      room({ id: "room-c", lastMessage: "older", lastMessageAt: "2026-07-26T00:00:00.000Z" }),
    ]);
    const roomA = data.chats![0]!;
    const roomC = data.chats![2]!;

    const dialingRow = {
      id: "msg-call-1",
      room_id: "room-b",
      sender_id: "u1",
      message_type: "call_stub",
      content: "발신 중",
      metadata: { sessionId: "s1", callStatus: "dialing", callKind: "voice" },
      created_at: startedAt,
    };
    const terminalRow = {
      ...dialingRow,
      content: "취소된 통화",
      metadata: { sessionId: "s1", callStatus: "cancelled", callKind: "voice" },
    };

    const hint = normalizeHomeMessageUpdateLivePatch(dialingRow, terminalRow);
    expect(hint).not.toBeNull();
    expect(hint?.source).toBe("message_update");

    const next = applyHomeListPatch(
      data,
      { kind: "realtime_message_update", roomId: "room-b", messageRow: terminalRow },
      "realtime"
    );
    expect(next).not.toBe(data);
    expect(next!.chats![1]!.lastMessage).toBe("취소된 통화");
    expect(next!.chats![1]!.lastMessageAt).toBe(startedAt);
    expect(next!.chats![0]).toBe(roomA);
    expect(next!.chats![2]).toBe(roomC);
  });

  it("rooms tip UPDATE bumps sort forward-only via applyHomeListPatch", () => {
    const olderAt = "2026-07-20T00:00:00.000Z";
    const newerAt = "2026-07-28T12:00:00.000Z";
    const data = bootstrap([
      room({ id: "room-top", lastMessage: "keep", lastMessageAt: "2026-07-27T00:00:00.000Z" }),
      room({ id: "room-low", lastMessage: "old", lastMessageAt: olderAt }),
    ]);
    const topRef = data.chats![0]!;

    const tip = normalizeHomeRoomTipUpdateLivePatch(
      { id: "room-low", last_message: "old", last_message_at: olderAt, last_message_type: "text" },
      {
        id: "room-low",
        last_message: "새 메시지",
        last_message_at: newerAt,
        last_message_type: "text",
      }
    );
    expect(tip).not.toBeNull();

    const next = applyHomeListPatch(
      data,
      {
        kind: "room_tip_update",
        roomId: "room-low",
        tip: tip!.preview,
      },
      "realtime"
    );
    expect(next!.chats![0]!.id).toBe("room-low");
    expect(next!.chats![0]!.lastMessage).toBe("새 메시지");
    expect(next!.chats![1]).toBe(topRef);
  });

  it("identical message UPDATE is dropped (idempotent)", () => {
    const row = {
      id: "m1",
      room_id: "room-1",
      message_type: "text",
      content: "same",
      created_at: startedAt,
    };
    expect(normalizeHomeMessageUpdateLivePatch(row, { ...row })).toBeNull();
  });

  it("stale rooms tip UPDATE does not rollback", () => {
    const data = bootstrap([
      room({ id: "room-1", lastMessage: "newer", lastMessageAt: "2026-07-28T12:00:00.000Z" }),
    ]);
    const same = patchBootstrapRoomListForRoomTipUpdate(data, "room-1", {
      lastMessage: "stale",
      lastMessageType: "text",
      lastMessageAt: "2026-07-28T11:00:00.000Z",
    });
    expect(same).toBe(data);
  });

  it("terminal then dialing replay does not rollback call preview", () => {
    const data = bootstrap([
      room({
        id: "room-1",
        lastMessage: "취소된 통화",
        lastMessageAt: startedAt,
        lastMessageType: "call_stub",
      }),
    ]);
    const dialingReplay = {
      id: "msg-1",
      room_id: "room-1",
      message_type: "call_stub",
      content: "발신 중",
      metadata: { sessionId: "s1", callStatus: "dialing", callKind: "voice" },
      created_at: startedAt,
    };
    const terminal = {
      ...dialingReplay,
      content: "취소된 통화",
      metadata: { sessionId: "s1", callStatus: "cancelled", callKind: "voice" },
    };
    expect(normalizeHomeMessageUpdateLivePatch(terminal, dialingReplay)).toBeNull();
    const after = patchBootstrapRoomListForRealtimeMessageUpdate(data, "room-1", dialingReplay);
    expect(after.chats![0]!.lastMessage).toBe("취소된 통화");
  });

  it("past message UPDATE does not move list order", () => {
    const tipAt = "2026-07-28T12:00:00.000Z";
    const data = bootstrap([
      room({ id: "room-1", lastMessage: "latest", lastMessageAt: tipAt }),
      room({ id: "room-2", lastMessage: "other", lastMessageAt: "2026-07-28T11:00:00.000Z" }),
    ]);
    const order = data.chats!.map((r) => r.id);
    const after = patchBootstrapRoomListForRealtimeMessageUpdate(data, "room-1", {
      id: "old-msg",
      room_id: "room-1",
      message_type: "text",
      content: "edited past",
      created_at: "2026-07-28T10:00:00.000Z",
    });
    expect(after).toBe(data);
    expect(after.chats!.map((r) => r.id)).toEqual(order);
  });

  it("dialing INSERT then terminal UPDATE keeps single room row", () => {
    const data = bootstrap([
      room({ id: "room-1", lastMessage: "hi", lastMessageAt: "2026-07-01T00:00:00.000Z" }),
    ]);
    const insertRow = {
      id: "msg-1",
      room_id: "room-1",
      sender_id: "u1",
      message_type: "call_stub",
      content: "발신 중",
      metadata: { sessionId: "s1", callStatus: "dialing", callKind: "voice" },
      created_at: startedAt,
    };
    const afterInsert = patchBootstrapRoomListForRealtimeMessageInsert(data, "room-1", insertRow);
    expect(afterInsert.chats).toHaveLength(1);
    const terminalRow = {
      ...insertRow,
      content: "부재중 전화",
      metadata: { sessionId: "s1", callStatus: "missed", callKind: "voice" },
    };
    const afterTerminal = applyHomeListPatch(
      afterInsert,
      { kind: "realtime_message_update", roomId: "room-1", messageRow: terminalRow },
      "realtime"
    );
    expect(afterTerminal!.chats).toHaveLength(1);
    expect(afterTerminal!.chats![0]!.lastMessage).toBe("부재중 전화");
    expect(afterTerminal!.chats![0]!.lastMessageAt).toBe(startedAt);
  });

  it("same tip UPDATE twice preserves room and array references", () => {
    const data = bootstrap([
      room({ id: "a", lastMessage: "x", lastMessageAt: "2026-07-28T01:00:00.000Z" }),
      room({
        id: "b",
        lastMessage: "발신 중",
        lastMessageAt: startedAt,
        lastMessageType: "call_stub",
      }),
      room({ id: "c", lastMessage: "z", lastMessageAt: "2026-07-28T00:00:00.000Z" }),
    ]);
    const terminal = {
      id: "m",
      room_id: "b",
      message_type: "call_stub",
      content: "취소된 통화",
      metadata: { sessionId: "s", callStatus: "cancelled", callKind: "voice" },
      created_at: startedAt,
    };
    const once = patchBootstrapRoomListForRealtimeMessageUpdate(data, "b", terminal);
    const twice = patchBootstrapRoomListForRealtimeMessageUpdate(once, "b", terminal);
    expect(twice).toBe(once);
    expect(twice.chats![0]).toBe(once.chats![0]);
    expect(twice.chats![2]).toBe(once.chats![2]);
  });
});
