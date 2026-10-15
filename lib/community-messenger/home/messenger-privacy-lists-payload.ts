/**
 * `GET /api/community-messenger/relations/privacy-lists` 응답 조립 — 순수 함수.
 *
 * SSOT:
 * - blocked = `listBlockedByMeIds` (user_social_relations blocked is_active + legacy user_relationships.blocked, by-me)
 * - hidden  = `user_relationships` relation_type/type = hidden (owner = viewer)
 * 두 목록은 별개 정책 — 한 사람이 둘 다에 있을 수 있다(차단 cleanup 이 숨김을 지우기 전 레거시 등). 그대로 보고한다.
 * 프로필 hydrate 는 합집합 1회(`hydrateProfiles`) 후 분배한다.
 */
import type { CommunityMessengerProfileLite } from "@/lib/community-messenger/types";

export type MessengerPrivacyListsPayload = {
  ok: true;
  blocked: CommunityMessengerProfileLite[];
  hidden: CommunityMessengerProfileLite[];
};

function dedupe(ids: readonly string[], excludeId: string): string[] {
  const out: string[] = [];
  const seen = new Set<string>();
  for (const raw of ids) {
    const id = String(raw ?? "").trim();
    if (!id || id === excludeId || seen.has(id)) continue;
    seen.add(id);
    out.push(id);
  }
  return out;
}

export function messengerPrivacyListsHydrateIds(
  viewerId: string,
  blockedIds: readonly string[],
  hiddenIds: readonly string[]
): { blockedIds: string[]; hiddenIds: string[]; unionIds: string[] } {
  const viewer = viewerId.trim();
  const b = dedupe(blockedIds, viewer);
  const h = dedupe(hiddenIds, viewer);
  return { blockedIds: b, hiddenIds: h, unionIds: dedupe([...b, ...h], viewer) };
}

/**
 * hydrate 된 프로필을 목록별로 분배. hydrate 에서 빠진 id 는 최소 프로필(라벨=id)로 채워
 * **목록에서 사람이 사라지지 않게** 한다(해제 버튼이 항상 보여야 함).
 */
export function buildMessengerPrivacyListsPayload(args: {
  blockedIds: readonly string[];
  hiddenIds: readonly string[];
  profiles: readonly CommunityMessengerProfileLite[];
}): MessengerPrivacyListsPayload {
  const byId = new Map(args.profiles.map((p) => [p.id, p] as const));
  const resolve = (id: string): CommunityMessengerProfileLite =>
    byId.get(id) ?? {
      id,
      label: id,
      avatarUrl: null,
      following: false,
      blocked: false,
      isFriend: false,
      isFavoriteFriend: false,
    };
  return {
    ok: true,
    blocked: args.blockedIds.map((id) => ({ ...resolve(id), blocked: true })),
    hidden: args.hiddenIds.map((id) => ({ ...resolve(id), isHiddenFriend: true })),
  };
}
