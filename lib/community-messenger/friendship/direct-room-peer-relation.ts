import "server-only";

import type { SupabaseClient } from "@supabase/supabase-js";
import {
  resolveFriendshipPair,
  type ResolveFriendshipPairResult,
} from "@/lib/community-messenger/friendship/resolve-friendship-pair";
import {
  friendshipPairResolutionFromResolved,
  projectRoomSnapshotFriendshipFromResolution,
} from "@/lib/community-messenger/friendship/room-snapshot-friendship-projection";
import { resolvePeerRelationLabel } from "@/lib/community-messenger/peer-relation-label";
import type { DirectRoomPeerRelation } from "@/lib/community-messenger/room/direct-room-peer-relation-patch";
import type { BlockedRelation } from "@/lib/social/user-block-ssot";

/**
 * §17-5 R-4: 일반 1:1 방의 상대 관계(친구·대기 요청·차단·거절) — 방 스냅샷과 `peer-relation` API 의 단일 판정 원천.
 * 통화 권한(`canStartDirectCallBetweenUsers`·`directCallGate`)은 여기서 계산하지 않는다.
 * `friendshipResolved` 를 넘기면 그 결과를 그대로 쓴다(스냅샷은 통화 권한과 같은 판정값을 공유).
 * `withRelationLabel` — API 만 켠다(방 스냅샷의 표시값은 지금처럼 통화 권한 결과를 쓰므로 조회를 늘리지 않음).
 */
export async function resolveDirectRoomPeerRelation(
  sb: SupabaseClient<any>,
  viewerUserId: string,
  peerUserId: string,
  friendshipResolved?: ResolveFriendshipPairResult,
  options?: {
    withRelationLabel?: boolean;
    /** R2-a: same-request reads shared with the direct-call gate (viewer→peer pair). */
    blockedPair?: BlockedRelation;
    rejectedByPeer?: boolean;
  }
): Promise<DirectRoomPeerRelation> {
  const [resolved, { fetchBlockedPairFromSb }, socialRelations] = await Promise.all([
    friendshipResolved ?? resolveFriendshipPair(sb, viewerUserId, peerUserId),
    import("@/lib/social/user-block-ssot"),
    import("@/lib/community-messenger/social-relations"),
  ]);
  const projection = projectRoomSnapshotFriendshipFromResolution(resolved);
  const accepted = projection.peerFriendshipState === "accepted";
  const [pending, blockRel, rejectedByPeer, savedByPeer] = await Promise.all([
    /** §17 R-2: 판정 함수는 친구/없음만 안다 — 받은·보낸 대기 요청은 따로 */
    accepted
      ? Promise.resolve(null)
      : socialRelations.fetchPendingFriendRequestBetween(sb as any, viewerUserId, peerUserId).catch(() => null),
    options?.blockedPair ? Promise.resolve(options.blockedPair) : fetchBlockedPairFromSb(sb, viewerUserId, peerUserId),
    typeof options?.rejectedByPeer === "boolean"
      ? Promise.resolve(options.rejectedByPeer)
      : socialRelations.fetchFriendRequestRejectedByPeer(sb as any, viewerUserId, peerUserId),
    options?.withRelationLabel ? isPeerSavedViewer(sb, viewerUserId, peerUserId) : Promise.resolve(null),
  ]);
  return {
    peerFriendshipState: pending ? "pending" : projection.peerFriendshipState,
    friendshipDirection: pending ? pending.direction : projection.friendshipDirection,
    pendingFriendshipRequestId: pending?.id ?? null,
    /** §14-5: 차단·거절이면 입력창에서 미리 막는다(발송 게이트와 같은 판정 원천) */
    directMessageDenied: blockRel.blockedEitherWay ? "blocked" : rejectedByPeer ? "rejected_by_peer" : null,
    /** §15-3: 내가 차단한 경우만 true(상대가 나를 차단한 사실은 노출하지 않음) */
    peerBlockedByMe: blockRel.blockedByMe === true,
    /**
     * 방 바(§15)의 「친구 아님」 판정 표시값 — 수락 직후 실시간 패치가 넣은 값이 친구 삭제 뒤에도 남지 않게
     * (2026-10-26 00:34 PHT Samsung: 상대가 친구 삭제 → 관계는 none 인데 바 미표시). 내 저장 = accepted.
     */
    ...(savedByPeer === null
      ? {}
      : {
          peerRelationLabel: resolvePeerRelationLabel({
            blockedEitherWay: blockRel.blockedEitherWay,
            blockedByMe: blockRel.blockedByMe,
            savedByMe: accepted,
            savedByPeer,
            friendship: friendshipPairResolutionFromResolved(resolved),
          }),
        }),
  };
}

/** 상대가 나를 연락처(친구)에 저장했는지 — 표시값 계산용(읽기만) */
async function isPeerSavedViewer(sb: SupabaseClient<any>, viewerUserId: string, peerUserId: string): Promise<boolean> {
  const { data, error } = await (sb as any)
    .from("user_social_relations")
    .select("id")
    .eq("owner_user_id", peerUserId)
    .eq("target_user_id", viewerUserId)
    .eq("relation_type", "friend")
    .limit(1)
    .maybeSingle();
  return !error && Boolean(data?.id);
}
