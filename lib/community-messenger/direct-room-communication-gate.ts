/**
 * CM direct room — block SSOT communication gate (message/call/push/incoming).
 * `blocked_hidden_at` 는 gate 에 사용하지 않는다.
 */

import type { SupabaseClient } from "@supabase/supabase-js";
import { getSupabaseServer } from "@/lib/chat/supabase-server";
import { tryCreateSupabaseServiceClient } from "@/lib/supabase/try-supabase-server";

function trimText(value: unknown): string {
  return typeof value === "string" ? value.trim() : "";
}

function getSupabaseOrNull(): SupabaseClient<any> | null {
  try {
    return getSupabaseServer();
  } catch {
    return tryCreateSupabaseServiceClient();
  }
}

/** direct 1:1 room 의 상대 user id (group/trade 키 방은 null) */
export async function resolveDirectRoomPeerUserId(
  roomId: string,
  viewerUserId: string,
  supabase?: SupabaseClient<any> | null,
  _t5?: import("@/lib/community-messenger/monitoring/t5-send-stage-trace").T5SendTrace
): Promise<string | null> {
  return (await resolveDirectRoomPeer(roomId, viewerUserId, supabase, _t5)).peerUserId;
}

/**
 * 상대 id + 지금 참가 중인지(S-1). 참가 행이 없으면 `direct_key` 로 상대를 찾고 `peerParticipating:false`.
 * 같은 2개 조회 결과만 쓴다(추가 조회 없음).
 */
async function resolveDirectRoomPeer(
  roomId: string,
  viewerUserId: string,
  supabase?: SupabaseClient<any> | null,
  _t5?: import("@/lib/community-messenger/monitoring/t5-send-stage-trace").T5SendTrace
): Promise<{ peerUserId: string | null; peerParticipating: boolean }> {
  const none = { peerUserId: null, peerParticipating: false };
  const rid = trimText(roomId);
  const viewer = trimText(viewerUserId);
  if (!rid || !viewer) return none;
  const sb = supabase ?? getSupabaseOrNull();
  if (!sb) return none;

  const peerTotalT0 = performance.now();
  let spanT5:
    | ((
        trace: import("@/lib/community-messenger/monitoring/t5-send-stage-trace").T5SendTrace,
        name: string,
        startedAtWall: number
      ) => number)
    | null = null;
  if (_t5) {
    spanT5 = (await import("@/lib/community-messenger/monitoring/t5-send-stage-trace")).spanT5;
  }

  const roomsT0 = performance.now();
  const partsT0 = performance.now();
  const roomPromise = (async () => {
    const result = await (sb as any)
      .from("community_messenger_rooms")
      .select("room_type, direct_key")
      .eq("id", rid)
      .maybeSingle();
    if (_t5 && spanT5) spanT5(_t5, "BG_peer_query_rooms_ms", roomsT0);
    return result;
  })();
  const partsPromise = (async () => {
    const result = await (sb as any)
      .from("community_messenger_participants")
      .select("user_id, left_at")
      .eq("room_id", rid);
    if (_t5 && spanT5) spanT5(_t5, "BG_peer_query_participants_ms", partsT0);
    return result;
  })();
  const [{ data: room }, { data: rows }] = await Promise.all([roomPromise, partsPromise]);

  const transformT0 = performance.now();
  const roomType = trimText((room as { room_type?: string } | null)?.room_type);
  if (roomType !== "direct") {
    if (_t5 && spanT5) {
      spanT5(_t5, "BG_peer_transform_ms", transformT0);
      spanT5(_t5, "BG_peer_total_ms", peerTotalT0);
    }
    return none;
  }

  const peers = dedupeIds(
    ((rows ?? []) as Array<{ user_id?: string | null }>)
      .map((row) => trimText(row.user_id))
      .filter((id) => id && id !== viewer)
  );
  const activePeers = new Set(
    ((rows ?? []) as Array<{ user_id?: string | null; left_at?: string | null }>)
      .filter((row) => !trimText(row.left_at))
      .map((row) => trimText(row.user_id))
  );
  let resolved: string | null = null;
  if (peers.length >= 1) {
    resolved = peers[0] ?? null;
  } else {
    const directKey = trimText((room as { direct_key?: string } | null)?.direct_key);
    if (directKey && !directKey.startsWith("trade_") && !directKey.startsWith("store_order:")) {
      const parts = directKey.split(":").filter(Boolean);
      if (parts.length === 2) {
        if (parts[0] === viewer) resolved = parts[1] ?? null;
        else if (parts[1] === viewer) resolved = parts[0] ?? null;
      }
    }
  }
  if (_t5 && spanT5) {
    spanT5(_t5, "BG_peer_transform_ms", transformT0);
    spanT5(_t5, "BG_peer_total_ms", peerTotalT0);
  }
  return { peerUserId: resolved, peerParticipating: Boolean(resolved && activePeers.has(resolved)) };
}

function dedupeIds(values: Iterable<string>): string[] {
  return [...new Set([...values].map((v) => trimText(v)).filter(Boolean))];
}

export type DirectRoomBlockDeny = {
  ok: false;
  /** blocked_target: 차단(양방향) · rejected_by_peer: 내 친구 요청을 상대가 거절(§14-5, 요청자 방향만) */
  error: "blocked_target" | "rejected_by_peer";
  peerUserId: string;
};

/**
 * active block row (is_active=true) 가 있으면 message deny.
 * F-2: 거래·주문 연결 방에는 소셜 차단 게이트를 적용하지 않는다(통화 게이트와 분리).
 */
export async function assertDirectRoomCommunicationNotBlocked(input: {
  viewerUserId: string;
  roomId: string;
  supabase?: SupabaseClient<any> | null;
  /** Opt-in T5 spans (`x-samarket-t5-trace`). */
  _t5?: import("@/lib/community-messenger/monitoring/t5-send-stage-trace").T5SendTrace;
  /**
   * 호출부가 이미 로드한 도메인 증거. 있으면 추가 product_chats/store_orders 조회를 생략.
   * 없으면 게이트 내부에서 room + 연결 행을 조회해 F-2 판정.
   */
  domainEvidence?: {
    roomType?: string | null;
    chatDomain?: string | null;
    directKey?: string | null;
    hasProductChatLink: boolean;
    hasStoreOrderLink: boolean;
  } | null;
}): Promise<
  | {
      ok: true;
      peerUserId: string | null;
      /**
       * S-1: 일반 1:1(pair `direct_key` · 거래·주문 연결 없음)에서 상대가 나가 참가 중이 아닐 때만 상대 id.
       * 보내기 경로가 저장 직전 `readmitLeftGeneralDirectPeerForSend` 로 되살린다(차단·거절 통과 뒤에만 채워짐).
       */
      readmitPeerUserId?: string | null;
    }
  | DirectRoomBlockDeny
> {
  const viewer = trimText(input.viewerUserId);
  const roomId = trimText(input.roomId);
  if (!viewer || !roomId) return { ok: true, peerUserId: null };

  const sb = input.supabase ?? getSupabaseOrNull();
  if (!sb) return { ok: true, peerUserId: null };

  const { shouldApplyCommunityDirectSocialBlockGate } = await import(
    "@/lib/community-messenger/server/community-direct-social-block-gate"
  );
  let domainEvidence = input.domainEvidence;
  if (!domainEvidence) {
    const [{ data: room }, { data: pc }, { data: so }] = await Promise.all([
      (sb as any)
        .from("community_messenger_rooms")
        .select("room_type, chat_domain, direct_key")
        .eq("id", roomId)
        .maybeSingle(),
      (sb as any)
        .from("product_chats")
        .select("id")
        .eq("community_messenger_room_id", roomId)
        .limit(1)
        .maybeSingle(),
      (sb as any)
        .from("store_orders")
        .select("id")
        .eq("community_messenger_room_id", roomId)
        .limit(1)
        .maybeSingle(),
    ]);
    domainEvidence = {
      roomType: trimText((room as { room_type?: string } | null)?.room_type) || null,
      chatDomain: trimText((room as { chat_domain?: string } | null)?.chat_domain) || null,
      directKey: trimText((room as { direct_key?: string } | null)?.direct_key) || null,
      hasProductChatLink: Boolean(pc),
      hasStoreOrderLink: Boolean(so),
    };
  }
  if (!shouldApplyCommunityDirectSocialBlockGate(domainEvidence)) {
    return { ok: true, peerUserId: null };
  }

  const { peerUserId, peerParticipating } = await resolveDirectRoomPeer(roomId, viewer, sb, input._t5);
  if (!peerUserId) return { ok: true, peerUserId: null };

  const blockTotalT0 = performance.now();
  let spanT5:
    | ((
        trace: import("@/lib/community-messenger/monitoring/t5-send-stage-trace").T5SendTrace,
        name: string,
        startedAtWall: number
      ) => number)
    | null = null;
  if (input._t5) {
    spanT5 = (await import("@/lib/community-messenger/monitoring/t5-send-stage-trace")).spanT5;
  }
  const timing: import("@/lib/social/user-block-ssot").FetchBlockedPairTiming = {
    queryMs: 0,
    transformMs: 0,
  };
  const { fetchBlockedPairFromSb } = await import("@/lib/social/user-block-ssot");
  const rel = await fetchBlockedPairFromSb(sb, viewer, peerUserId, timing);
  if (input._t5 && spanT5) {
    input._t5.spans.BG_block_query_ms = timing.queryMs;
    input._t5.spans.BG_block_transform_ms = timing.transformMs;
    spanT5(input._t5, "BG_block_total_ms", blockTotalT0);
  }
  if (rel.blockedEitherWay) {
    return { ok: false, error: "blocked_target", peerUserId };
  }
  const { fetchFriendRequestRejectedByPeer } = await import("@/lib/community-messenger/social-relations");
  if (await fetchFriendRequestRejectedByPeer(sb, viewer, peerUserId)) {
    return { ok: false, error: "rejected_by_peer", peerUserId };
  }
  const { isMessengerGeneralFriendDirectKey } = await import("@/lib/community-messenger/messenger-room-domain");
  const readmitPeerUserId =
    !peerParticipating &&
    isMessengerGeneralFriendDirectKey(domainEvidence.directKey) &&
    !domainEvidence.hasProductChatLink &&
    !domainEvidence.hasStoreOrderLink
      ? peerUserId
      : null;
  return { ok: true, peerUserId, readmitPeerUserId };
}
