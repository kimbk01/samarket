import type { CommunityMessengerProfileLite } from "@/lib/community-messenger/types";

/** 최근 맺은 친구 구간(기본 24시간) */
export const MESSENGER_NEW_FRIEND_WINDOW_MS = 24 * 60 * 60 * 1000;

export function isMessengerNewFriend(
  friend: CommunityMessengerProfileLite,
  nowMs: number,
  windowMs: number = MESSENGER_NEW_FRIEND_WINDOW_MS
): boolean {
  const raw = friend.friendshipAcceptedAt;
  if (!raw) return false;
  const acceptedAt = new Date(raw).getTime();
  if (!Number.isFinite(acceptedAt)) return false;
  return nowMs - acceptedAt <= windowMs;
}

export function compareMessengerFriendsForHomeList(
  a: CommunityMessengerProfileLite,
  b: CommunityMessengerProfileLite,
  nowMs: number,
  windowMs: number = MESSENGER_NEW_FRIEND_WINDOW_MS
): number {
  const newA = isMessengerNewFriend(a, nowMs, windowMs) ? 1 : 0;
  const newB = isMessengerNewFriend(b, nowMs, windowMs) ? 1 : 0;
  if (newA !== newB) return newB - newA;
  if (newA && newB) {
    const ta = new Date(a.friendshipAcceptedAt ?? 0).getTime();
    const tb = new Date(b.friendshipAcceptedAt ?? 0).getTime();
    if (ta !== tb) return tb - ta;
  }
  return a.label.localeCompare(b.label, "ko");
}

export function partitionMessengerFriendsByNew(
  friends: CommunityMessengerProfileLite[],
  nowMs: number,
  windowMs: number = MESSENGER_NEW_FRIEND_WINDOW_MS
): { newFriends: CommunityMessengerProfileLite[]; regularFriends: CommunityMessengerProfileLite[] } {
  const newFriends: CommunityMessengerProfileLite[] = [];
  const regularFriends: CommunityMessengerProfileLite[] = [];
  for (const friend of friends) {
    if (isMessengerNewFriend(friend, nowMs, windowMs)) {
      newFriends.push(friend);
    } else {
      regularFriends.push(friend);
    }
  }
  return { newFriends, regularFriends };
}
