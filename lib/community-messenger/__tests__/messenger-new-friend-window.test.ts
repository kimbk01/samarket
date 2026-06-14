import { describe, expect, it } from "vitest";
import {
  isMessengerNewFriend,
  partitionMessengerFriendsByNew,
} from "@/lib/community-messenger/messenger-new-friend-window";
import type { CommunityMessengerProfileLite } from "@/lib/community-messenger/types";

function friend(id: string, acceptedAt: string | null): CommunityMessengerProfileLite {
  return {
    id,
    label: id,
    avatarUrl: null,
    following: false,
    blocked: false,
    isFriend: true,
    isFavoriteFriend: false,
    friendshipAcceptedAt: acceptedAt,
  };
}

describe("messenger-new-friend-window", () => {
  const now = new Date("2026-06-15T12:00:00.000Z").getTime();

  it("detects friends accepted within 24 hours", () => {
    expect(isMessengerNewFriend(friend("a", "2026-06-14T12:00:00.000Z"), now)).toBe(true);
    expect(isMessengerNewFriend(friend("b", "2026-06-14T11:59:59.000Z"), now)).toBe(false);
    expect(isMessengerNewFriend(friend("c", null), now)).toBe(false);
  });

  it("partitions new and regular friends", () => {
    const friends = [
      friend("new", "2026-06-14T12:00:00.000Z"),
      friend("old", "2026-05-01T12:00:00.000Z"),
    ];
    const { newFriends, regularFriends } = partitionMessengerFriendsByNew(friends, now);
    expect(newFriends.map((f) => f.id)).toEqual(["new"]);
    expect(regularFriends.map((f) => f.id)).toEqual(["old"]);
  });

  it("moves friend to regular section after 24-hour window", () => {
    const acceptedAt = "2026-06-14T12:00:00.000Z";
    const friends = [friend("edge", acceptedAt)];
    const beforeExpiry = new Date("2026-06-15T11:59:59.000Z").getTime();
    const afterExpiry = new Date("2026-06-15T12:00:01.000Z").getTime();
    expect(partitionMessengerFriendsByNew(friends, beforeExpiry).newFriends).toHaveLength(1);
    expect(partitionMessengerFriendsByNew(friends, afterExpiry).regularFriends).toHaveLength(1);
  });
});
