import { describe, expect, it } from "vitest";
import {
  createMessengerHomeCanonicalState,
  reduceMessengerHomeRoomEvent,
} from "@/lib/community-messenger/home/inbox-pipeline/reducer";
import type {
  CanonicalMessengerHomeRoomPatch,
  MessengerHomeCanonicalState,
  MessengerHomeRoomEvent,
  MessengerHomeSource,
} from "@/lib/community-messenger/home/inbox-pipeline/types";

function fullPatch(roomId: string, extra: Partial<CanonicalMessengerHomeRoomPatch> = {}): CanonicalMessengerHomeRoomPatch {
  return {
    roomId,
    roomType: "direct",
    directKey: null,
    contextMeta: null,
    title: roomId,
    avatarUrl: null,
    latestMessage: "hello",
    latestMessageType: "text",
    lastMessageAt: "2026-07-13T00:00:00.000Z",
    unreadCount: 0,
    isArchived: false,
    isBlockedHidden: false,
    roomStatus: "active",
    memberCount: 2,
    ...extra,
  };
}

function event(
  source: MessengerHomeSource,
  generation: number,
  patch: CanonicalMessengerHomeRoomPatch
): MessengerHomeRoomEvent {
  return { source, generation, roomId: patch.roomId, patch };
}

function apply(
  state: MessengerHomeCanonicalState,
  source: MessengerHomeSource,
  generation: number,
  patch: CanonicalMessengerHomeRoomPatch
) {
  return reduceMessengerHomeRoomEvent(state, event(source, generation, patch));
}

describe("reduceMessengerHomeRoomEvent", () => {
  it("prevents trade metadata regression to sparse null", () => {
    let state = createMessengerHomeCanonicalState();
    state = apply(state, "full", 1, fullPatch("r1", { contextMeta: { v: 1, kind: "trade", productChatId: "pc" } }));
    state = apply(state, "lite", 2, { roomId: "r1", contextMeta: null });
    expect(state.rooms.get("r1")?.contextMeta?.kind).toBe("trade");
  });

  it("prevents delivery metadata regression to sparse null", () => {
    let state = createMessengerHomeCanonicalState();
    state = apply(state, "full", 1, fullPatch("r1", { contextMeta: { v: 1, kind: "delivery", storeOrderId: "o" } }));
    state = apply(state, "critical", 2, { roomId: "r1", contextMeta: null });
    expect(state.rooms.get("r1")?.contextMeta?.kind).toBe("delivery");
  });

  it("drops lower generation for the same room/source", () => {
    let state = createMessengerHomeCanonicalState();
    state = apply(state, "full", 2, fullPatch("r1", { title: "new" }));
    state = apply(state, "full", 1, fullPatch("r1", { title: "old" }));
    expect(state.rooms.get("r1")?.title).toBe("new");
  });

  it("keeps generation isolated per room", () => {
    let state = createMessengerHomeCanonicalState();
    state = apply(state, "full", 10, fullPatch("room-a", { title: "A" }));
    state = apply(state, "full", 1, fullPatch("room-b", { title: "B" }));
    expect(state.rooms.get("room-a")?.title).toBe("A");
    expect(state.rooms.get("room-b")?.title).toBe("B");
  });

  it("is idempotent for identical event re-delivery", () => {
    let state = createMessengerHomeCanonicalState();
    const e = event("full", 1, fullPatch("r1"));
    state = reduceMessengerHomeRoomEvent(state, e);
    const again = reduceMessengerHomeRoomEvent(state, e);
    expect(again).toBe(state);
    expect(again.rooms.get("r1")).toBe(state.rooms.get("r1"));
  });

  it("drops stale latestMessage timestamp", () => {
    let state = createMessengerHomeCanonicalState();
    state = apply(state, "full", 1, fullPatch("r1", {
      latestMessage: "new",
      lastMessageAt: "2026-07-13T00:05:00.000Z",
    }));
    state = apply(state, "realtime", 2, {
      roomId: "r1",
      latestMessage: "old",
      lastMessageAt: "2026-07-13T00:01:00.000Z",
    });
    expect(state.rooms.get("r1")?.latestMessage).toBe("new");
  });

  it("allows participant read event to decrease unread", () => {
    let state = createMessengerHomeCanonicalState();
    state = apply(state, "full", 1, fullPatch("r1", { unreadCount: 5 }));
    state = apply(state, "participant", 1, { roomId: "r1", unreadCount: 0 });
    expect(state.rooms.get("r1")?.unreadCount).toBe(0);
  });

  it("does not let critical unread 0 erase existing unread", () => {
    let state = createMessengerHomeCanonicalState();
    state = apply(state, "full", 1, fullPatch("r1", { unreadCount: 5 }));
    state = apply(state, "critical", 2, { roomId: "r1", unreadCount: 0 });
    expect(state.rooms.get("r1")?.unreadCount).toBe(5);
  });

  it("keeps references when an event produces no changes", () => {
    let state = createMessengerHomeCanonicalState();
    state = apply(state, "full", 1, fullPatch("r1"));
    const room = state.rooms.get("r1");
    const next = apply(state, "lite", 1, { roomId: "r1" });
    expect(next).toBe(state);
    expect(next.rooms.get("r1")).toBe(room);
  });

  it("stores incomplete new-room patches without fabricating a canonical room", () => {
    const state = apply(createMessengerHomeCanonicalState(), "realtime", 1, {
      roomId: "r1",
      latestMessage: "pending",
    });
    expect(state.rooms.has("r1")).toBe(false);
    expect(state.pendingPatches.get("r1")?.latestMessage).toBe("pending");
  });
});
