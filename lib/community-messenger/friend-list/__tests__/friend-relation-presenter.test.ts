import { describe, expect, it } from "vitest";
import { presentFriendListRow } from "@/lib/community-messenger/friend-list/friend-relation-presenter";

describe("friend-relation-presenter", () => {
  it("does not expose pending badge statuses (Contact transition)", () => {
    const row = presentFriendListRow({
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
    });
    expect(row.status).toBe("friend");
    expect(row.statusBadgeKey).not.toMatch(/pending/);
  });

  it("blocks readd during cooldown", () => {
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

  it("strips leading @ from profile subtitle public id", () => {
    const row = presentFriendListRow({
      profile: {
        id: "peer",
        label: "Peer",
        subtitle: "@aa11",
        avatarUrl: null,
        isFriend: true,
        isFavoriteFriend: false,
        blocked: false,
        isHiddenFriend: false,
        following: false,
      },
      viewerUserId: "me",
    });
    expect(row.publicId).toBe("aa11");
  });
});
