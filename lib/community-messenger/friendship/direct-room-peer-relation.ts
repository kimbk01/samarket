import "server-only";

import type { SupabaseClient } from "@supabase/supabase-js";
import {
  resolveFriendshipPair,
  type ResolveFriendshipPairResult,
} from "@/lib/community-messenger/friendship/resolve-friendship-pair";
import { projectRoomSnapshotFriendshipFromResolution } from "@/lib/community-messenger/friendship/room-snapshot-friendship-projection";
import type { DirectRoomPeerRelation } from "@/lib/community-messenger/room/direct-room-peer-relation-patch";

/**
 * §17-5 R-4: 일반 1:1 방의 상대 관계(친구·대기 요청·차단·거절) — 방 스냅샷과 `peer-relation` API 의 단일 판정 원천.
 * 통화 권한(`canStartDirectCallBetweenUsers`·`directCallGate`)은 여기서 계산하지 않는다.
 * `friendshipResolved` 를 넘기면 그 결과를 그대로 쓴다(스냅샷은 통화 권한과 같은 판정값을 공유).
 */
export async function resolveDirectRoomPeerRelation(
  sb: SupabaseClient<any>,
  viewerUserId: string,
  peerUserId: string,
  friendshipResolved?: ResolveFriendshipPairResult
): Promise<DirectRoomPeerRelation> {
  const [resolved, { fetchBlockedPairFromSb }, socialRelations] = await Promise.all([
    friendshipResolved ?? resolveFriendshipPair(sb, viewerUserId, peerUserId),
    import("@/lib/social/user-block-ssot"),
    import("@/lib/community-messenger/social-relations"),
  ]);
  const projection = projectRoomSnapshotFriendshipFromResolution(resolved);
  const accepted = projection.peerFriendshipState === "accepted";
  const [pending, blockRel, rejectedByPeer] = await Promise.all([
    /** §17 R-2: 판정 함수는 친구/없음만 안다 — 받은·보낸 대기 요청은 따로 */
    accepted
      ? Promise.resolve(null)
      : socialRelations.fetchPendingFriendRequestBetween(sb as any, viewerUserId, peerUserId).catch(() => null),
    fetchBlockedPairFromSb(sb, viewerUserId, peerUserId),
    socialRelations.fetchFriendRequestRejectedByPeer(sb as any, viewerUserId, peerUserId),
  ]);
  return {
    peerFriendshipState: pending ? "pending" : projection.peerFriendshipState,
    friendshipDirection: pending ? pending.direction : projection.friendshipDirection,
    pendingFriendshipRequestId: pending?.id ?? null,
    /** §14-5: 차단·거절이면 입력창에서 미리 막는다(발송 게이트와 같은 판정 원천) */
    directMessageDenied: blockRel.blockedEitherWay ? "blocked" : rejectedByPeer ? "rejected_by_peer" : null,
    /** §15-3: 내가 차단한 경우만 true(상대가 나를 차단한 사실은 노출하지 않음) */
    peerBlockedByMe: blockRel.blockedByMe === true,
  };
}
