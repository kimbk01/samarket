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

/**
 * 친구 탭 「새 친구」 묶음 기간 — 최근 7일 (채팅 시안 4판, Owner 「정확히 시안대로」 2026-11-10).
 * 시안 메모: 「기간 7일은 제가 정한 값, Owner 확인 필요」 — 값은 이 상수 하나.
 * 위 24시간 구간(목록 정렬·배지)과는 별개다.
 */
export const MESSENGER_HOME_NEW_FRIENDS_SECTION_WINDOW_MS = 7 * 24 * 60 * 60 * 1000;

/**
 * 「새 친구」 묶음 — 친구가 된 시각(`friendshipAcceptedAt` = 수락된 친구 요청 `responded_at`·연락처 저장 시각, 서버 값)이
 * 최근 7일 안인 친구, 최근 순. 시각이 없으면 넣지 않는다(기기 시계가 조금 늦어 방금 수락이 「미래」로 보여도 넣는다). 이 친구들은 「친구 N」 목록에도 그대로 남는다.
 */
export function selectMessengerHomeNewFriends(
  friends: CommunityMessengerProfileLite[],
  nowMs: number,
  windowMs: number = MESSENGER_HOME_NEW_FRIENDS_SECTION_WINDOW_MS
): CommunityMessengerProfileLite[] {
  const picked: { friend: CommunityMessengerProfileLite; at: number }[] = [];
  for (const friend of friends) {
    if (!friend.isFriend) continue;
    const raw = friend.friendshipAcceptedAt;
    if (!raw) continue;
    const at = new Date(raw).getTime();
    if (!Number.isFinite(at)) continue;
    const age = nowMs - at;
    if (age > windowMs || age < -windowMs) continue;
    picked.push({ friend, at });
  }
  picked.sort((a, b) => b.at - a.at || a.friend.label.localeCompare(b.friend.label, "ko"));
  return picked.map((p) => p.friend);
}
