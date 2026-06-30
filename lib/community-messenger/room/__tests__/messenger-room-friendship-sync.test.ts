import { describe, expect, it } from "vitest";
import {
  parseFriendshipRowForRoomSync,
  patchRoomSnapshotAfterFriendshipAccepted,
  shouldRefreshRoomOnFriendshipEvent,
} from "@/lib/community-messenger/room/messenger-room-friendship-sync";
import { shouldRunMessengerRoomFriendshipSync } from "@/lib/community-messenger/room/use-messenger-room-friendship-sync";
import type { CommunityMessengerRoomSnapshot, CommunityMessengerRoomSummary } from "@/lib/community-messenger/types";

function roomSummary(partial: Partial<CommunityMessengerRoomSummary>): CommunityMessengerRoomSummary {
  return {
    id: partial.id ?? "r1",
    roomType: partial.roomType ?? "direct",
    roomStatus: "active",
    visibility: "private",
    joinPolicy: "invite_only",
    identityPolicy: "real_name",
    isReadonly: false,
    title: "",
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
    peerUserId: partial.peerUserId ?? "peer-b",
    messengerDirectKey: partial.messengerDirectKey ?? null,
    contextMeta: partial.contextMeta ?? null,
  };
}

describe("shouldRunMessengerRoomFriendshipSync", () => {
  const pairKey = "aaaaaaaa-bbbb-bbbb-bbbb-bbbbbbbbbbbb:cccccccc-dddd-dddd-dddd-dddddddddddd";
  const viewer = "aaaaaaaa-bbbb-bbbb-bbbb-bbbbbbbbbbbb";
  const peer = "cccccccc-dddd-dddd-dddd-dddddddddddd";

  it("runs for general pair even with legacy trade contextMeta", () => {
    expect(
      shouldRunMessengerRoomFriendshipSync(
        roomSummary({
          messengerDirectKey: pairKey,
          contextMeta: { v: 1, kind: "trade", headline: "legacy" },
        })
      )
    ).toBe(true);
  });

  it("runs when messengerDirectKey is missing but viewer+peer form general pair", () => {
    expect(
      shouldRunMessengerRoomFriendshipSync(
        roomSummary({
          messengerDirectKey: null,
          peerUserId: peer,
          contextMeta: { v: 1, kind: "trade", headline: "legacy" },
        }),
        viewer
      )
    ).toBe(true);
  });

  it("skips confirmed trade_pc rooms", () => {
    expect(
      shouldRunMessengerRoomFriendshipSync(
        roomSummary({
          messengerDirectKey: "trade_pc:abc:peer-b",
          contextMeta: { v: 1, kind: "trade" },
        })
      )
    ).toBe(false);
  });

  it("skips store_order delivery rooms", () => {
    expect(
      shouldRunMessengerRoomFriendshipSync(
        roomSummary({
          messengerDirectKey: "store_order:order-1:peer-b",
          contextMeta: { v: 1, kind: "delivery" },
        })
      )
    ).toBe(false);
  });
});

describe("shouldRefreshRoomOnFriendshipEvent", () => {
  it("returns true when viewer and peer are in the friendship pair", () => {
    expect(
      shouldRefreshRoomOnFriendshipEvent({
        viewerUserId: "viewer",
        peerUserId: "peer",
        requesterUserId: "viewer",
        addresseeUserId: "peer",
        status: "accepted",
      })
    ).toBe(true);
  });

  it("returns false when peer is not in the pair", () => {
    expect(
      shouldRefreshRoomOnFriendshipEvent({
        viewerUserId: "viewer",
        peerUserId: "peer",
        requesterUserId: "viewer",
        addresseeUserId: "other",
        status: "accepted",
      })
    ).toBe(false);
  });
});

describe("parseFriendshipRowForRoomSync", () => {
  it("optimistic accepted when status is accepted for the open room peer", () => {
    const parsed = parseFriendshipRowForRoomSync(
      {
        status: "accepted",
        requester_user_id: "viewer",
        addressee_user_id: "peer",
      },
      "viewer",
      "peer"
    );
    expect(parsed.shouldRefresh).toBe(true);
    expect(parsed.optimisticAccepted).toBe(true);
  });

  it("refresh without optimistic patch for pending", () => {
    const parsed = parseFriendshipRowForRoomSync(
      {
        status: "pending",
        requester_user_id: "peer",
        addressee_user_id: "viewer",
      },
      "viewer",
      "peer"
    );
    expect(parsed.shouldRefresh).toBe(true);
    expect(parsed.optimisticAccepted).toBe(false);
  });
});

describe("patchRoomSnapshotAfterFriendshipAccepted", () => {
  const baseSnapshot = {
    viewerUserId: "viewer",
    room: {
      id: "room-1",
      title: "Peer",
      roomType: "direct",
      peerUserId: "peer",
      roomStatus: "active",
      isReadonly: false,
    },
    members: [
      {
        id: "viewer",
        label: "Me",
        avatarUrl: null,
        isFriend: false,
        blocked: false,
        following: false,
        isFavoriteFriend: false,
        isHiddenFriend: false,
      },
      {
        id: "peer",
        label: "Peer",
        avatarUrl: null,
        isFriend: false,
        blocked: false,
        following: false,
        isFavoriteFriend: false,
        isHiddenFriend: false,
      },
    ],
    messages: [],
    myRole: "member",
    activeCall: null,
  } as unknown as CommunityMessengerRoomSnapshot;

  it("sets peer isFriend and directCallGate allow flags", () => {
    const next = patchRoomSnapshotAfterFriendshipAccepted(baseSnapshot, "peer");
    expect(next.peerFriendshipState).toBe("accepted");
    expect(next.directCallGate?.canStartVoice).toBe(true);
    expect(next.directCallGate?.canStartVideo).toBe(true);
    expect(next.members.find((m) => m.id === "peer")?.isFriend).toBe(true);
  });
});
