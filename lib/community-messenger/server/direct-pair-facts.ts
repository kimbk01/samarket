/**
 * 1-C — 1:1 상대 관계 행을 `community_messenger_direct_pair_facts` 1회로 읽는다.
 * 계획: docs/audit/messenger-room-check-fanout-fix-plan-2026-10-31.md 「1-C」.
 * 이 모듈은 행만 돌려준다 — 판정(차단·친구·거절·통화 허용)은 호출자가 기존 함수 그대로 한다.
 * null = 읽기 실패 → 호출자는 기존 개별 조회 경로를 그대로 탄다.
 */
import type { BlockedRelation } from "@/lib/social/user-block-ssot";
import type { ResolveFriendshipPairResult } from "@/lib/community-messenger/friendship/resolve-friendship-pair";

export type DirectPairRoomFacts = {
  roomType: string;
  /** 비어 있으면 호출자가 기존처럼 "active" 로 본다 */
  roomStatus: string;
  isReadonly: boolean;
  viewerIsParticipant: boolean;
  peerIsParticipant: boolean;
};

export type DirectPairFacts = {
  viewerUserId: string;
  peerUserId: string;
  /** facts 를 읽은 방 — null 이면 방 값 없음 */
  roomId: string | null;
  blockedByViewer: boolean;
  blockedByPeer: boolean;
  /** viewer 가 peer 를 친구로 저장 (`isFriendSavedByOwner(viewer, peer)`) */
  savedByViewer: boolean;
  /** peer 가 viewer 를 친구로 저장 (`isFriendSavedByOwner(peer, viewer)`) */
  savedByPeer: boolean;
  /** `fetchFriendRequestRejectedByPeer(viewer, peer)` */
  rejectedByPeer: boolean;
  /** `fetchPendingFriendRequestBetween(viewer, peer)` */
  pending: { id: string; direction: "outgoing_pending" | "incoming_pending" } | null;
  viewerStatus: string;
  peerStatus: string;
  /** `profiles.messenger_direct_call_policy` 원값 (해석은 resolveDirectCallPolicy) */
  peerCallPolicyRaw: unknown;
  /** `isUnknownPeerNoticeDismissed(viewer, peer, room)` — 방 없이 읽었으면 false */
  unknownPeerNoticeDismissed: boolean;
  /** 방이 없거나 방 없이 읽었으면 null (`loadRoomParticipantContext` 의 null 과 같다) */
  room: DirectPairRoomFacts | null;
};

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

function trimText(value: unknown): string {
  return typeof value === "string" ? value.trim() : "";
}

export async function loadDirectPairFacts(
  sb: unknown,
  viewerUserId: string,
  peerUserId: string,
  roomId?: string | null
): Promise<DirectPairFacts | null> {
  const viewer = trimText(viewerUserId);
  const peer = trimText(peerUserId);
  const room = trimText(roomId);
  if (!viewer || !peer || viewer === peer || !UUID_RE.test(viewer) || !UUID_RE.test(peer)) return null;
  if (!sb || typeof (sb as { rpc?: unknown }).rpc !== "function") return null;
  const { data, error } = await (sb as any).rpc("community_messenger_direct_pair_facts", {
    p_viewer_id: viewer,
    p_peer_id: peer,
    p_room_key: room || null,
  });
  if (error || !data || typeof data !== "object") return null;
  const row = data as Record<string, unknown>;
  const pendingId = trimText(row.pending_request_id);
  return {
    viewerUserId: viewer,
    peerUserId: peer,
    roomId: room || null,
    blockedByViewer: row.blocked_by_viewer === true,
    blockedByPeer: row.blocked_by_peer === true,
    savedByViewer: row.saved_by_viewer === true,
    savedByPeer: row.saved_by_peer === true,
    rejectedByPeer: row.rejected_by_peer === true,
    pending: pendingId
      ? {
          id: pendingId,
          direction: trimText(row.pending_requester_id) === viewer ? "outgoing_pending" : "incoming_pending",
        }
      : null,
    viewerStatus: trimText(row.viewer_status),
    peerStatus: trimText(row.peer_status),
    peerCallPolicyRaw: row.peer_call_policy,
    unknownPeerNoticeDismissed: Boolean(trimText(row.unknown_peer_notice_dismissed_at)),
    room:
      row.room_exists === true
        ? {
            roomType: trimText(row.room_type),
            roomStatus: trimText(row.room_status),
            isReadonly: row.room_is_readonly === true,
            viewerIsParticipant: row.viewer_in_room === true,
            peerIsParticipant: row.peer_in_room === true,
          }
        : null,
  };
}

/** `fetchBlockedPairFromSb(viewer, peer)` 와 같은 모양 */
export function blockedRelationFromPairFacts(facts: DirectPairFacts): BlockedRelation {
  return {
    blockedByMe: facts.blockedByViewer,
    blockedByPeer: facts.blockedByPeer,
    blockedEitherWay: facts.blockedByViewer || facts.blockedByPeer,
  };
}

/** `resolveFriendshipPair(viewer, peer)` 와 같은 결과 (친구 = viewer 가 peer 를 저장) */
export function friendshipResolvedFromPairFacts(facts: DirectPairFacts): ResolveFriendshipPairResult {
  return facts.savedByViewer
    ? { state: "accepted", direction: "mutual_accepted", row: null, source: "social_relations" }
    : { state: "none", direction: "none", row: null, source: "none" };
}

/** facts 가 이 쌍·이 방(또는 방 불필요)에 대한 것인지 */
export function pairFactsMatch(
  facts: DirectPairFacts | null | undefined,
  viewerUserId: string,
  peerUserId: string,
  roomId?: string | null
): facts is DirectPairFacts {
  if (!facts) return false;
  if (facts.viewerUserId !== trimText(viewerUserId) || facts.peerUserId !== trimText(peerUserId)) return false;
  const room = trimText(roomId);
  return !room || facts.roomId === room;
}
