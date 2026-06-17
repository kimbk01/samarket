import { describe, expect, it } from "vitest";
import { compareFriendListRows } from "@/lib/community-messenger/friend-list/friend-list-sorter";
import type { FriendListRowViewModel } from "@/lib/community-messenger/friend-list/friend-relation-presenter";

function row(partial: Partial<FriendListRowViewModel>): FriendListRowViewModel {
  return {
    profileId: partial.profileId ?? "1",
    displayName: partial.displayName ?? "A",
    publicId: null,
    avatarUrl: null,
    status: partial.status ?? "friend",
    statusBadgeKey: "cm_friend_badge_friend",
    statusBadgeColor: "#006241",
    isFavorite: partial.isFavorite ?? false,
    isNewFriend: partial.isNewFriend ?? false,
    subtitle: null,
    canAddFriend: false,
    readdBlockedUntil: null,
    ...partial,
  };
}

describe("friend-list-sorter", () => {
  it("orders me, favorite, new, then name", () => {
    const sorted = [
      row({ profileId: "b", displayName: "Beta" }),
      row({ profileId: "me", displayName: "Me", status: "me" }),
      row({ profileId: "fav", displayName: "Fav", isFavorite: true }),
      row({ profileId: "new", displayName: "New", isNewFriend: true }),
    ].sort(compareFriendListRows);
    expect(sorted.map((r) => r.profileId)).toEqual(["me", "fav", "new", "b"]);
  });
});
