import { beforeEach, describe, expect, it } from "vitest";
import { clearAllRoomSnapshotCaches, peekRoomSnapshot } from "@/lib/community-messenger/room-snapshot-cache";
import {
  applyIncomingMessageEvent,
  getMessengerRealtimeRoomMessages,
  resetMessengerRealtimeStore,
  seedMessengerRealtimeFromRoomSnapshot,
} from "@/lib/community-messenger/stores/messenger-realtime-store";
import type { CommunityMessengerMessage, CommunityMessengerRoomSnapshot } from "@/lib/community-messenger/types";

const ROOM_ID = "a4b49e55-a95f-4872-88a5-cc309f3d9814";
const VIEWER = "11111111-1111-1111-1111-111111111111";
const PEER = "22222222-2222-2222-2222-222222222222";

function uuid(n: number): string {
  return `00000000-0000-4000-8000-${String(n).padStart(12, "0")}`;
}

function msg(n: number, extra?: Partial<CommunityMessengerMessage>): CommunityMessengerMessage {
  return {
    id: uuid(n),
    roomId: ROOM_ID,
    senderId: PEER,
    senderLabel: "Peer",
    messageType: "text",
    content: `m${n}`,
    createdAt: `2026-10-01T00:00:${String(n).padStart(2, "0")}.000Z`,
    clientMessageId: null,
    isMine: false,
    ...extra,
  };
}

function snapshotOf(messages: CommunityMessengerMessage[]): CommunityMessengerRoomSnapshot {
  return {
    viewerUserId: VIEWER,
    myRole: "member",
    room: {
      id: ROOM_ID,
      title: "Test",
      roomType: "direct",
      unreadCount: 0,
      lastMessage: messages.at(-1)?.content ?? "",
      lastMessageAt: messages.at(-1)?.createdAt ?? "2026-10-01T00:00:00.000Z",
      memberCount: 2,
      roomStatus: "active",
      isReadonly: false,
      visibility: "private",
      joinPolicy: "invite",
      identityPolicy: "real_name",
      description: "",
      summary: null,
      isMuted: false,
      isPinned: false,
    },
    members: [],
    messages,
    activeCall: null,
  } as unknown as CommunityMessengerRoomSnapshot;
}

describe("C-8 realtime store: same-id content change updates runtime list + room snapshot cache", () => {
  beforeEach(() => {
    resetMessengerRealtimeStore();
    clearAllRoomSnapshotCaches();
  });

  it("edit after insert (same id) is written to the snapshot cache (no stale paint on reopen)", () => {
    seedMessengerRealtimeFromRoomSnapshot(snapshotOf([msg(1), msg(2)]));
    applyIncomingMessageEvent({ viewerUserId: VIEWER, roomId: ROOM_ID, message: msg(3) });
    expect(peekRoomSnapshot(ROOM_ID, VIEWER)?.messages.find((m) => m.id === uuid(3))?.content).toBe("m3");

    applyIncomingMessageEvent({
      viewerUserId: VIEWER,
      roomId: ROOM_ID,
      message: msg(3, { content: "edited", metadata: { editedAt: "2026-10-01T00:01:00.000Z" } }),
    });
    expect(peekRoomSnapshot(ROOM_ID, VIEWER)?.messages.find((m) => m.id === uuid(3))?.content).toBe("edited");
    expect(getMessengerRealtimeRoomMessages(ROOM_ID).find((m) => m.id === uuid(3))?.content).toBe("edited");
  });

  it("delete-for-everyone and call status changes are applied in place", () => {
    seedMessengerRealtimeFromRoomSnapshot(snapshotOf([msg(1)]));
    const stub = msg(4, { messageType: "call_stub", callStatus: "dialing", callSessionId: "s1", content: "" });
    applyIncomingMessageEvent({ viewerUserId: VIEWER, roomId: ROOM_ID, message: stub });
    applyIncomingMessageEvent({ viewerUserId: VIEWER, roomId: ROOM_ID, message: { ...stub, callStatus: "ended" } });
    expect(peekRoomSnapshot(ROOM_ID, VIEWER)?.messages.find((m) => m.id === uuid(4))?.callStatus).toBe("ended");

    applyIncomingMessageEvent({ viewerUserId: VIEWER, roomId: ROOM_ID, message: msg(5) });
    applyIncomingMessageEvent({
      viewerUserId: VIEWER,
      roomId: ROOM_ID,
      message: msg(5, { deletedForEveryoneAt: "2026-10-01T00:02:00.000Z", content: "" }),
    });
    expect(peekRoomSnapshot(ROOM_ID, VIEWER)?.messages.find((m) => m.id === uuid(5))?.deletedForEveryoneAt).toBe(
      "2026-10-01T00:02:00.000Z"
    );
    /** stale pre-delete version arriving late cannot resurrect the tombstone */
    applyIncomingMessageEvent({ viewerUserId: VIEWER, roomId: ROOM_ID, message: msg(5) });
    expect(peekRoomSnapshot(ROOM_ID, VIEWER)?.messages.find((m) => m.id === uuid(5))?.deletedForEveryoneAt).toBe(
      "2026-10-01T00:02:00.000Z"
    );
  });

  it("identical duplicate (bump ↔ postgres echo, cid-only difference) is still a no-op", () => {
    seedMessengerRealtimeFromRoomSnapshot(snapshotOf([msg(1)]));
    applyIncomingMessageEvent({ viewerUserId: VIEWER, roomId: ROOM_ID, message: msg(6) });
    const before = getMessengerRealtimeRoomMessages(ROOM_ID);
    applyIncomingMessageEvent({ viewerUserId: VIEWER, roomId: ROOM_ID, message: msg(6, { clientMessageId: "cid-x" }) });
    expect(getMessengerRealtimeRoomMessages(ROOM_ID)).toBe(before);
  });

  it("update of a message outside the cached window is not inserted into the snapshot cache", () => {
    seedMessengerRealtimeFromRoomSnapshot(snapshotOf([msg(10), msg(11)]));
    /** first apply: id unseen; then remove from consideration by checking a second edit only updates if cached */
    applyIncomingMessageEvent({ viewerUserId: VIEWER, roomId: ROOM_ID, message: msg(12) });
    applyIncomingMessageEvent({ viewerUserId: VIEWER, roomId: ROOM_ID, message: msg(12, { content: "e1" }) });
    const ids = peekRoomSnapshot(ROOM_ID, VIEWER)?.messages.map((m) => m.id) ?? [];
    expect(ids.filter((id) => id === uuid(12))).toHaveLength(1);
  });
});
