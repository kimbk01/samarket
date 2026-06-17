import { describe, expect, it } from "vitest";
import { mapFriendshipStateToSearchGuard } from "@/lib/community-messenger/friendship/search-response-mapper";
import type { CommunityMessengerFriendshipState } from "@/lib/community-messenger/friendship/types";

function base(partial: Partial<CommunityMessengerFriendshipState>): CommunityMessengerFriendshipState {
  return {
    status: "none",
    friendshipStatus: "none",
    friendshipId: null,
    canMessage: false,
    canCall: false,
    canAddFriend: true,
    canUnblock: false,
    isFriend: false,
    isBlockedByMe: false,
    isBlockedByPeer: false,
    readdBlockedUntil: null,
    requestRoomId: null,
    requestMessageId: null,
    ...partial,
  };
}

describe("search button mapper by friendship status", () => {
  it("none -> can add friend", () => {
    const g = mapFriendshipStateToSearchGuard(base({ canAddFriend: true }));
    expect(g.canSendFriendRequest).toBe(true);
    expect(g.canMessage).toBe(false);
  });

  it("pending incoming -> cannot message", () => {
    const g = mapFriendshipStateToSearchGuard(
      base({ status: "request_pending_incoming", friendshipStatus: "pending", canAddFriend: false })
    );
    expect(g.relationshipStatus).toBe("request_pending_incoming");
    expect(g.canMessage).toBe(false);
    expect(g.canCall).toBe(false);
  });

  it("accepted -> message and call", () => {
    const g = mapFriendshipStateToSearchGuard(
      base({ status: "accepted", friendshipStatus: "accepted", isFriend: true, canMessage: true, canCall: true })
    );
    expect(g.isFriend).toBe(true);
    expect(g.canMessage).toBe(true);
    expect(g.canCall).toBe(true);
  });

  it("blocked_by_me -> limited", () => {
    const g = mapFriendshipStateToSearchGuard(
      base({
        status: "blocked_by_me",
        friendshipStatus: "blocked",
        isBlockedByMe: true,
        canAddFriend: false,
      })
    );
    expect(g.isBlockedByMe).toBe(true);
    expect(g.canSendFriendRequest).toBe(false);
  });

  it("removed with future readd -> cannot add", () => {
    const g = mapFriendshipStateToSearchGuard(
      base({
        friendshipStatus: "removed",
        readdBlockedUntil: new Date(Date.now() + 60_000).toISOString(),
        canAddFriend: false,
      })
    );
    expect(g.canSendFriendRequest).toBe(false);
    expect(g.readdBlockedUntil).toBeTruthy();
  });
});
