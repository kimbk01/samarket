import { describe, expect, it } from "vitest";
import { presentFriendListRow } from "@/lib/community-messenger/friend-list/friend-relation-presenter";

describe("friend-relation-presenter", () => {
  it("marks pending received and blocks readd during cooldown", () => {
    const pending = presentFriendListRow({
      profile: {
        id: "peer",
        label: "Peer",
        avatarUrl: null,
        isFriend: false,
        isFavoriteFriend: false,
        blocked: false,
        isHiddenFriend: false,
        following: false,
      },
      viewerUserId: "me",
      pendingIncoming: true,
    });
    expect(pending.status).toBe("pending_received");

    const blockedReadd = presentFriendListRow({
      profile: {
        id: "peer2",
        label: "Peer2",
        avatarUrl: null,
        isFriend: false,
        isFavoriteFriend: false,
        blocked: false,
        isHiddenFriend: false,
        following: false,
      },
      viewerUserId: "me",
      readdBlockedUntil: new Date(Date.now() + 60_000).toISOString(),
      nowMs: Date.now(),
    });
    expect(blockedReadd.canAddFriend).toBe(false);
  });
});
