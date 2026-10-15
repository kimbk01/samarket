/**
 * 메신저 홈 친구·숨김·차단 즉시 반영(로컬 낙관 패치) + 차단 토글 의도 결정 — 순수 함수.
 *
 * 정책:
 * - 차단(block) = `user_social_relations` blocked is_active (by-me). 숨김(hide) = `user_relationships` hidden.
 *   두 정책은 별개 — 차단 패치는 서버(`cleanupCommunityMessengerFriendGraphOnBlock`)와 동일하게
 *   내 친구 행·숨김 행만 정리하고, 숨김 패치는 차단 상태를 건드리지 않는다.
 * - 차단 해제는 친구를 복구하지 않는다(서버 `unblockUserSocial` 와 동일).
 * - 이후 서버 SSOT(`GET /relations/privacy-lists`) hydrate 가 authoritative 로 교체한다.
 */
import type { CommunityMessengerBootstrap, CommunityMessengerProfileLite } from "@/lib/community-messenger/types";

export type BlockToggleIntent = "block" | "unblock";

/**
 * 차단 토글 시 POST(차단) vs DELETE(해제) 결정 — **내가 차단했는지(by-me)** 만 본다.
 * 상대가 나를 차단(`isBlockedByPeer`)한 것은 해제 대상이 아니다 — 그 경우에도 나는 상대를 차단할 수 있어야 한다.
 *
 * by-me 신호 의미:
 * - 검색 결과 `isBlockedByMe` (search API; `isBlockedByPeer` 는 무시)
 * - 부트스트랩 `blocked` 목록 = `listBlockedByMeIds` (by-me)
 * - 부트스트랩 풀(friends/hidden/following) `profile.blocked` = `buildProfilesFromKnownRelations(blockedIds)`
 *   / `getViewerRelationSets` (owner 행만) → by-me
 * - 프로필 시트 `profile.blocked` — 위 풀에서 온 프로필 → by-me
 */
export function resolveMessengerBlockToggleIntent(args: {
  targetUserId: string;
  searchHit?: { isBlockedByMe: boolean; isBlockedByPeer?: boolean } | null;
  blockedByMe?: readonly CommunityMessengerProfileLite[] | null;
  pools?: ReadonlyArray<readonly CommunityMessengerProfileLite[] | null | undefined>;
  sheetProfile?: Pick<CommunityMessengerProfileLite, "id" | "blocked"> | null;
}): BlockToggleIntent {
  const id = args.targetUserId.trim();
  if (args.searchHit) return args.searchHit.isBlockedByMe ? "unblock" : "block";
  if ((args.blockedByMe ?? []).some((p) => p.id === id)) return "unblock";
  for (const pool of args.pools ?? []) {
    const hit = (pool ?? []).find((p) => p.id === id);
    if (hit) return hit.blocked ? "unblock" : "block";
  }
  if (args.sheetProfile?.id === id) return args.sheetProfile.blocked ? "unblock" : "block";
  return "block";
}

function findKnownProfile(
  prev: CommunityMessengerBootstrap,
  userId: string
): CommunityMessengerProfileLite | null {
  for (const pool of [prev.friends, prev.hidden, prev.blocked, prev.following]) {
    const hit = (pool ?? []).find((p) => p.id === userId);
    if (hit) return hit;
  }
  return null;
}

function friendsTabCount(
  friends: readonly CommunityMessengerProfileLite[],
  hidden: readonly CommunityMessengerProfileLite[] | undefined
): number {
  const hiddenIds = new Set((hidden ?? []).map((p) => p.id));
  return friends.filter((p) => !hiddenIds.has(p.id) && p.isHiddenFriend !== true).length;
}

/**
 * 차단/해제 성공 직후 로컬 패치.
 * - block: 내 친구·숨김 목록에서 제거(서버 cleanup 과 동일), `blocked` 에 추가, 모든 사본 `blocked=true`.
 * - unblock: `blocked` 에서 제거, 모든 사본 `blocked=false` (친구 복구 없음).
 * `blocked` 가 unknown(undefined) 이어도 즉시 반영을 위해 배열로 만든다 — 직후 privacy-lists hydrate 가 교체.
 */
export function applyLocalBlockStatePatch(
  prev: CommunityMessengerBootstrap,
  targetUserId: string,
  blocked: boolean,
  fallbackProfile?: CommunityMessengerProfileLite | null
): CommunityMessengerBootstrap {
  const id = targetUserId.trim();
  if (!id) return prev;
  const flag = (list: CommunityMessengerProfileLite[]) =>
    list.map((p) => (p.id === id && p.blocked !== blocked ? { ...p, blocked } : p));
  if (blocked) {
    const known = findKnownProfile(prev, id) ?? fallbackProfile ?? null;
    const blockedProfile = known
      ? { ...known, blocked: true, isFriend: false, isFavoriteFriend: false, isHiddenFriend: false }
      : null;
    const friends = prev.friends.filter((p) => p.id !== id);
    const hidden = prev.hidden === undefined ? undefined : prev.hidden.filter((p) => p.id !== id);
    const blockedBase = (prev.blocked ?? []).filter((p) => p.id !== id);
    const nextBlocked = blockedProfile ? [...blockedBase, blockedProfile] : blockedBase;
    return {
      ...prev,
      tabs: { ...prev.tabs, friends: friendsTabCount(friends, hidden) },
      friends,
      hidden,
      blocked: nextBlocked,
      following: flag(prev.following),
    };
  }
  const nextBlocked = prev.blocked === undefined ? undefined : prev.blocked.filter((p) => p.id !== id);
  return {
    ...prev,
    friends: flag(prev.friends),
    hidden: prev.hidden === undefined ? undefined : flag(prev.hidden),
    blocked: nextBlocked,
    following: flag(prev.following),
  };
}

/**
 * 친구 삭제 성공 직후 로컬 패치 — `friends`·`hidden` 에서 제거, 다른 사본은 `isFriend=false`.
 * `mergeFriendsNeverShrinkContactSet` 은 유지(부분 페이로드 깜빡임 방지) — 대신 이 패치 + 캐시 prime/무효화로 재등장을 막는다.
 */
export function applyLocalFriendRemovedPatch(
  prev: CommunityMessengerBootstrap,
  friendUserId: string
): CommunityMessengerBootstrap {
  const id = friendUserId.trim();
  if (!id) return prev;
  const unfriend = (list: CommunityMessengerProfileLite[]) =>
    list.map((p) =>
      p.id === id && (p.isFriend || p.isFavoriteFriend || p.isHiddenFriend)
        ? { ...p, isFriend: false, isFavoriteFriend: false, isHiddenFriend: false }
        : p
    );
  const friends = prev.friends.filter((p) => p.id !== id);
  const hidden = prev.hidden === undefined ? undefined : prev.hidden.filter((p) => p.id !== id);
  return {
    ...prev,
    tabs: { ...prev.tabs, friends: friendsTabCount(friends, hidden) },
    friends,
    hidden,
    following: unfriend(prev.following),
    blocked: prev.blocked === undefined ? undefined : unfriend(prev.blocked),
  };
}
