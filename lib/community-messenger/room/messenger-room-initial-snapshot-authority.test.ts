import { describe, expect, it } from "vitest";
import type { CommunityMessengerRoomSnapshot } from "@/lib/community-messenger/types";
import {
  assertStoreOrderRoomBootstrapHasTimelineSeed,
  canMountCommunityMessengerRoomClient,
  isAuthoritativeMessengerRoomEntrySnapshot,
  isMessengerRoomConfirmedEmptySnapshot,
  pickAuthoritativeMessengerRoomSnapshot,
  pickRichestAuthoritativeRoomSnapshot,
  shouldPromoteLocalRoomSnapshotToEntryLoaded,
} from "@/lib/community-messenger/room/messenger-room-initial-snapshot-authority";
import { primeHotRoomSnapshot, primeRoomSnapshot } from "@/lib/community-messenger/room-snapshot-cache";

function snap(partial: Partial<CommunityMessengerRoomSnapshot> & { roomId: string; viewerUserId: string }): CommunityMessengerRoomSnapshot {
  const baseRoom = {
    roomType: "direct" as const,
    roomStatus: "active" as const,
    visibility: "private" as const,
    joinPolicy: "invite_only" as const,
    identityPolicy: "alias_allowed" as const,
    isReadonly: false,
    title: "t",
    subtitle: "",
    summary: "",
    avatarUrl: null,
    unreadCount: 0,
    lastMessage: "",
    lastMessageAt: new Date().toISOString(),
    memberCount: 2,
    ownerUserId: null,
    ownerLabel: "",
    memberLimit: null,
    isDiscoverable: false,
    requiresPassword: false,
    allowMemberInvite: false,
    ...(partial.room ?? {}),
    id: partial.roomId,
  };
  const { room: _ignoredRoom, ...restPartial } = partial;
  return {
    myRole: "member",
    members: [],
    messages: [],
    readReceipt: null,
    activeCall: null,
    ...restPartial,
    room: baseRoom,
  } as CommunityMessengerRoomSnapshot;
}

function msg(roomId: string, id: string): CommunityMessengerRoomSnapshot["messages"][number] {
  return {
    id,
    roomId,
    senderId: "x",
    senderLabel: "x",
    messageType: "text",
    content: "hi",
    createdAt: "2026-01-01T00:00:00.000Z",
    isMine: false,
    clientMessageId: null,
    callKind: null,
    callStatus: null,
    callSessionId: null,
  };
}

describe("pickAuthoritativeMessengerRoomSnapshot", () => {
  it("진입 게이트 complete server 시드가 lastMessage-only peek 보다 우선한다", () => {
    const viewer = "owner-1";
    const roomId = "room-a";
    primeRoomSnapshot(
      roomId,
      snap({
        roomId,
        viewerUserId: viewer,
        messages: [],
        room: { lastMessage: "목록 미리보기만" } as CommunityMessengerRoomSnapshot["room"],
      })
    );
    const server = snap({
      roomId,
      viewerUserId: viewer,
      messages: [msg(roomId, "m1")],
    });
    const picked = pickAuthoritativeMessengerRoomSnapshot({
      roomId,
      viewerUserId: viewer,
      serverSnapshot: server,
    });
    expect(picked?.messages.length).toBe(1);
  });

  it("complete hot 캐시가 lastMessage-only peek 보다 messages 가 많으면 hot 을 쓴다", () => {
    const viewer = "owner-1";
    const roomId = "room-hot";
    primeRoomSnapshot(
      roomId,
      snap({
        roomId,
        viewerUserId: viewer,
        messages: [],
        room: { lastMessage: "peek hint" } as CommunityMessengerRoomSnapshot["room"],
      })
    );
    primeHotRoomSnapshot(
      roomId,
      snap({
        roomId,
        viewerUserId: viewer,
        messages: [msg(roomId, "h1")],
      })
    );
    const picked = pickAuthoritativeMessengerRoomSnapshot({
      roomId,
      viewerUserId: viewer,
      serverSnapshot: null,
    });
    expect(picked?.messages.length).toBe(1);
    expect(picked?.messages[0]?.id).toBe("h1");
  });

  it("lastMessage-only snapshot 은 authoritative room seed 가 될 수 없다", () => {
    const viewer = "owner-1";
    const roomId = "room-hint-only";
    const hintOnly = snap({
      roomId,
      viewerUserId: viewer,
      messages: [],
      room: { lastMessage: "preview only" } as CommunityMessengerRoomSnapshot["room"],
    });
    expect(isAuthoritativeMessengerRoomEntrySnapshot(hintOnly)).toBe(false);
    expect(canMountCommunityMessengerRoomClient(hintOnly)).toBe(false);
    expect(shouldPromoteLocalRoomSnapshotToEntryLoaded(hintOnly)).toBe(false);

    primeRoomSnapshot(roomId, hintOnly);
    const picked = pickAuthoritativeMessengerRoomSnapshot({
      roomId,
      viewerUserId: viewer,
      serverSnapshot: null,
    });
    expect(picked).toBeNull();
  });

  it("complete seed 후보가 없으면 pickRichestAuthoritativeRoomSnapshot 은 null", () => {
    const hintOnly = snap({
      roomId: "r1",
      viewerUserId: "u1",
      messages: [],
      room: { lastMessage: "stub" } as CommunityMessengerRoomSnapshot["room"],
    });
    expect(pickRichestAuthoritativeRoomSnapshot(null, hintOnly)).toBeNull();
  });

  it("confirmed empty room 은 authoritative 이다", () => {
    const empty = snap({
      roomId: "empty-1",
      viewerUserId: "u1",
      messages: [],
      room: { lastMessage: "" } as CommunityMessengerRoomSnapshot["room"],
    });
    expect(isMessengerRoomConfirmedEmptySnapshot(empty)).toBe(true);
    expect(isAuthoritativeMessengerRoomEntrySnapshot(empty)).toBe(true);
    expect(canMountCommunityMessengerRoomClient(empty)).toBe(true);
    expect(shouldPromoteLocalRoomSnapshotToEntryLoaded(empty)).toBe(true);
  });

  it("complete snapshot 이면 기존처럼 진입 가능", () => {
    const complete = snap({
      roomId: "room-ok",
      viewerUserId: "u1",
      messages: [msg("room-ok", "m1")],
      room: { lastMessage: "hi" } as CommunityMessengerRoomSnapshot["room"],
    });
    expect(canMountCommunityMessengerRoomClient(complete)).toBe(true);
    expect(pickAuthoritativeMessengerRoomSnapshot({
      roomId: "room-ok",
      viewerUserId: "u1",
      serverSnapshot: complete,
    })?.messages[0]?.id).toBe("m1");
  });
});

describe("assertStoreOrderRoomBootstrapHasTimelineSeed", () => {
  it("delivery 방에 lastMessage 힌트만 있고 messages 가 비면 실패", () => {
    const bad = snap({
      roomId: "r1",
      viewerUserId: "u1",
      messages: [],
      room: {
        lastMessage: "hello",
        contextMeta: {
          v: 1,
          kind: "delivery",
          storeOrderId: "o1",
          storeId: "s1",
          headline: "h",
        },
      } as CommunityMessengerRoomSnapshot["room"],
    });
    expect(assertStoreOrderRoomBootstrapHasTimelineSeed(bad).ok).toBe(false);
  });

  it("일반 방 lastMessage-only 는 incomplete_timeline_seed", () => {
    const bad = snap({
      roomId: "r2",
      viewerUserId: "u1",
      messages: [],
      room: { lastMessage: "hello" } as CommunityMessengerRoomSnapshot["room"],
    });
    expect(assertStoreOrderRoomBootstrapHasTimelineSeed(bad)).toEqual({
      ok: false,
      reason: "incomplete_timeline_seed",
    });
  });
});
