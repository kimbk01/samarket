import { describe, expect, it } from "vitest";
import {
  parseFriendshipRowForRoomSync,
  patchRoomSnapshotAfterFriendshipAccepted,
  shouldRefreshRoomOnFriendshipEvent,
} from "@/lib/community-messenger/room/messenger-room-friendship-sync";
import type { CommunityMessengerRoomSnapshot } from "@/lib/community-messenger/types";

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
