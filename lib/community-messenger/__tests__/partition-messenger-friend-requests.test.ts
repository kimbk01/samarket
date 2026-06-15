import { describe, expect, it } from "vitest";
import { mergeFriendRequestsKeepStaleOutgoingForBootstrap } from "@/lib/community-messenger/home-list-patch";
import {
  buildMessengerFriendRejectedPeerEntries,
  countAllPendingMessengerFriendRequests,
  countReceivedPendingMessengerFriendRequests,
  hasActiveMessengerFriendRejectCooldown,
  partitionPendingMessengerFriendRequests,
} from "@/lib/community-messenger/partition-messenger-friend-requests";
import type { CommunityMessengerBootstrap, CommunityMessengerFriendRequest } from "@/lib/community-messenger/types";

function pendingRequest(partial: Partial<CommunityMessengerFriendRequest> & Pick<CommunityMessengerFriendRequest, "id">): CommunityMessengerFriendRequest {
  return {
    requesterId: "me-1",
    requesterLabel: "Me",
    addresseeId: "peer-1",
    addresseeLabel: "Peer",
    status: "pending",
    direction: "outgoing",
    createdAt: "2026-01-01T00:00:00.000Z",
    ...partial,
  };
}

function bootstrapWithRequests(requests: CommunityMessengerFriendRequest[]): CommunityMessengerBootstrap {
  return {
    me: { id: "me-1", label: "Me", avatarUrl: null, following: false, blocked: false, isFriend: false, isFavoriteFriend: false },
    tabs: { friends: 1, chats: 0, groups: 0, calls: 0 },
    friends: [
      {
        id: "peer-1",
        label: "Peer",
        avatarUrl: null,
        following: false,
        blocked: false,
        isFriend: true,
        isFavoriteFriend: false,
        friendshipAcceptedAt: "2026-06-15T12:00:00.000Z",
      },
    ],
    following: [],
    hidden: [],
    blocked: [],
    requests,
    chats: [],
    groups: [],
    discoverableGroups: [],
    calls: [],
  };
}

describe("partitionPendingMessengerFriendRequests", () => {
  it("splits pending by direction", () => {
    const out = partitionPendingMessengerFriendRequests([
      pendingRequest({ id: "o1", direction: "outgoing" }),
      pendingRequest({ id: "i1", direction: "incoming", requesterId: "peer-2", addresseeId: "me-1" }),
      pendingRequest({ id: "a1", status: "accepted" }),
    ]);
    expect(out.sent.map((r) => r.id)).toEqual(["o1"]);
    expect(out.received.map((r) => r.id)).toEqual(["i1"]);
  });
});

describe("friend request counts", () => {
  it("counts received pending only for friends tab badge", () => {
    expect(
      countReceivedPendingMessengerFriendRequests([
        pendingRequest({ id: "o1", direction: "outgoing" }),
        pendingRequest({ id: "i1", direction: "incoming", requesterId: "p", addresseeId: "me-1" }),
      ])
    ).toBe(1);
  });

  it("counts all pending for archive badge", () => {
    expect(
      countAllPendingMessengerFriendRequests([
        pendingRequest({ id: "o1", direction: "outgoing" }),
        pendingRequest({ id: "i1", direction: "incoming", requesterId: "p", addresseeId: "me-1" }),
      ])
    ).toBe(2);
  });
});

describe("hasActiveMessengerFriendRejectCooldown", () => {
  it("is true while any peer cooldown is in the future", () => {
    const now = 1_000_000;
    expect(hasActiveMessengerFriendRejectCooldown({ a: now + 1 }, now)).toBe(true);
    expect(hasActiveMessengerFriendRejectCooldown({ a: now - 1 }, now)).toBe(false);
  });
});

describe("buildMessengerFriendRejectedPeerEntries", () => {
  it("returns active cooldown peers with labels", () => {
    const now = 1_000_000;
    const entries = buildMessengerFriendRejectedPeerEntries({
      cooldownUntilByPeerId: { "peer-1": now + 60_000, "peer-2": now - 1 },
      labelsByPeerId: { "peer-1": "Alice" },
      nowMs: now,
      fallbackLabel: "상대",
    });
    expect(entries).toHaveLength(1);
    expect(entries[0]?.peerId).toBe("peer-1");
    expect(entries[0]?.label).toBe("Alice");
  });
});

describe("mergeFriendRequestsKeepStaleOutgoingForBootstrap", () => {
  it("does not keep stale outgoing pending when peer is already a friend", () => {
    const base = bootstrapWithRequests([
      pendingRequest({ id: "req-stale", addresseeId: "peer-1" }),
    ]);
    const merged = mergeFriendRequestsKeepStaleOutgoingForBootstrap(base, []);
    expect(merged).toHaveLength(0);
  });

  it("keeps optimistic outgoing pending when server lag omits the row", () => {
    const base = bootstrapWithRequests([
      pendingRequest({ id: "req-live", addresseeId: "peer-9" }),
    ]);
    const merged = mergeFriendRequestsKeepStaleOutgoingForBootstrap(base, []);
    expect(merged).toHaveLength(1);
    expect(merged[0]?.id).toBe("req-live");
  });
});
