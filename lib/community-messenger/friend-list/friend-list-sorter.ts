import {
  compareMessengerFriendsForHomeList,
  isMessengerNewFriend,
  MESSENGER_NEW_FRIEND_WINDOW_MS,
} from "@/lib/community-messenger/messenger-new-friend-window";
import type { CommunityMessengerProfileLite } from "@/lib/community-messenger/types";
import type { FriendListRowViewModel } from "@/lib/community-messenger/friend-list/friend-relation-presenter";

export function compareFriendListRows(a: FriendListRowViewModel, b: FriendListRowViewModel): number {
  if (a.status === "me") return -1;
  if (b.status === "me") return 1;
  const favA = a.isFavorite ? 1 : 0;
  const favB = b.isFavorite ? 1 : 0;
  if (favA !== favB) return favB - favA;
  const newA = a.isNewFriend ? 1 : 0;
  const newB = b.isNewFriend ? 1 : 0;
  if (newA !== newB) return newB - newA;
  return a.displayName.localeCompare(b.displayName, "ko");
}

export function sortFriendListRows(rows: FriendListRowViewModel[]): FriendListRowViewModel[] {
  return [...rows].sort(compareFriendListRows);
}

export function sortFriendProfiles(
  profiles: CommunityMessengerProfileLite[],
  nowMs: number = Date.now()
): CommunityMessengerProfileLite[] {
  return [...profiles].sort((a, b) => compareMessengerFriendsForHomeList(a, b, nowMs, MESSENGER_NEW_FRIEND_WINDOW_MS));
}

export function partitionFriendProfilesByNew(
  profiles: CommunityMessengerProfileLite[],
  nowMs: number = Date.now()
): { newFriends: CommunityMessengerProfileLite[]; regularFriends: CommunityMessengerProfileLite[] } {
  const newFriends: CommunityMessengerProfileLite[] = [];
  const regularFriends: CommunityMessengerProfileLite[] = [];
  for (const profile of profiles) {
    if (isMessengerNewFriend(profile, nowMs, MESSENGER_NEW_FRIEND_WINDOW_MS)) {
      newFriends.push(profile);
    } else {
      regularFriends.push(profile);
    }
  }
  newFriends.sort((a, b) => compareMessengerFriendsForHomeList(a, b, nowMs, MESSENGER_NEW_FRIEND_WINDOW_MS));
  regularFriends.sort((a, b) => a.label.localeCompare(b.label, "ko"));
  return { newFriends, regularFriends };
}
