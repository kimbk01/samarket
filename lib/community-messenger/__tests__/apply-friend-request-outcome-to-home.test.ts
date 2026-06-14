import { describe, expect, it } from "vitest";
import {
  applyFriendRequestOutcomeToHomeState,
  resolveFriendRequestPeerLabel,
} from "@/lib/community-messenger/apply-friend-request-outcome-to-home";
import type { CommunityMessengerBootstrap } from "@/lib/community-messenger/types";

function baseBootstrap(): CommunityMessengerBootstrap {
  return {
    me: { id: "me-1", label: "Me", avatarUrl: null, following: false, blocked: false, isFriend: false, isFavoriteFriend: false },
    tabs: { friends: 0, chats: 0, groups: 0, calls: 0 },
    friends: [],
    following: [],
    hidden: [],
    blocked: [],
    requests: [
      {
        id: "req-1",
        requesterId: "me-1",
        requesterLabel: "Me",
        addresseeId: "peer-1",
        addresseeLabel: "Peer One",
        status: "pending",
        direction: "outgoing",
        createdAt: "2026-01-01T00:00:00.000Z",
      },
    ],
    chats: [],
    groups: [],
    discoverableGroups: [],
    calls: [],
  };
}

describe("apply-friend-request-outcome-to-home", () => {
  it("removes pending and adds friend on accept for requester", () => {
    const prev = baseBootstrap();
    const out = applyFriendRequestOutcomeToHomeState(prev, {
      meId: "me-1",
      requesterUserId: "me-1",
      addresseeUserId: "peer-1",
      requestId: "req-1",
      status: "accepted",
      peerId: "peer-1",
      acceptedAt: "2026-06-15T12:00:00.000Z",
      peerFallbackLabel: "상대",
    });
    expect(out).not.toBeNull();
    expect(out!.bootstrap.requests).toHaveLength(0);
    expect(out!.bootstrap.friends).toHaveLength(1);
    expect(out!.bootstrap.friends[0]?.id).toBe("peer-1");
    expect(out!.bootstrap.friends[0]?.label).toBe("Peer One");
    expect(out!.bootstrap.friends[0]?.friendshipAcceptedAt).toBe("2026-06-15T12:00:00.000Z");
    expect(out!.shouldShowAcceptSnackbar).toBe(true);
    expect(out!.shouldNavigateFriendsTab).toBe(true);
  });

  it("removes pending without adding friend on reject", () => {
    const prev = baseBootstrap();
    const out = applyFriendRequestOutcomeToHomeState(prev, {
      meId: "me-1",
      requesterUserId: "me-1",
      addresseeUserId: "peer-1",
      requestId: "req-1",
      status: "rejected",
      peerId: "peer-1",
      peerFallbackLabel: "상대",
    });
    expect(out!.bootstrap.requests).toHaveLength(0);
    expect(out!.bootstrap.friends).toHaveLength(0);
    expect(out!.shouldShowRejectSnackbar).toBe(true);
    expect(out!.shouldApplyRejectCooldown).toBe(true);
  });

  it("preserves peer label from pending request row", () => {
    const label = resolveFriendRequestPeerLabel(
      baseBootstrap().requests,
      "me-1",
      "peer-1",
      "req-1",
      undefined,
      "fallback"
    );
    expect(label).toBe("Peer One");
  });

  it("fills friendshipAcceptedAt when friend already exists without timestamp", () => {
    const prev: CommunityMessengerBootstrap = {
      ...baseBootstrap(),
      friends: [
        {
          id: "peer-1",
          label: "Peer One",
          avatarUrl: null,
          following: false,
          blocked: false,
          isFriend: true,
          isFavoriteFriend: false,
          friendshipAcceptedAt: null,
        },
      ],
      requests: [],
    };
    const out = applyFriendRequestOutcomeToHomeState(prev, {
      meId: "me-1",
      requesterUserId: "me-1",
      addresseeUserId: "peer-1",
      requestId: "req-legacy",
      status: "accepted",
      peerId: "peer-1",
      acceptedAt: "2026-06-15T12:00:00.000Z",
      peerFallbackLabel: "상대",
    });
    expect(out!.bootstrap.friends).toHaveLength(1);
    expect(out!.bootstrap.friends[0]?.friendshipAcceptedAt).toBe("2026-06-15T12:00:00.000Z");
  });
});
