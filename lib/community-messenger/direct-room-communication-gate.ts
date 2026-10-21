/**
 * CM direct room — block SSOT 메시지 송신 gate (`assertMessengerRoomSendAllowed`·텍스트 전송 공용).
 * `blocked_hidden_at` 는 gate 에 사용하지 않는다.
 * D1 — 사용자 차단은 일반 1:1 에만 적용: `chat_domain` 이 trade/store_order 인 방은 차단 검사를 건너뛴다.
 * (통화 gate 는 `direct-call-permission.ts` 가 별도로 판정한다.)
 */

import type { SupabaseClient } from "@supabase/supabase-js";
import { getSupabaseServer } from "@/lib/chat/supabase-server";
import { tryCreateSupabaseServiceClient } from "@/lib/supabase/try-supabase-server";
import { isUserBlockExemptChatDomain } from "@/lib/chat-domain/user-block-gate-scope";

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

function isMissingChatDomainColumnError(error: unknown): boolean {
  const msg = String((error as { message?: unknown })?.message ?? "");
  return /chat_domain/i.test(msg) && /does not exist|42703|schema cache/i.test(msg);
}

/** direct 1:1 room 의 상대 user id (group/trade 키 방은 null) */
export async function resolveDirectRoomPeerUserId(
  roomId: string,
  viewerUserId: string,
  supabase?: SupabaseClient<any> | null,
  _t5?: import("@/lib/community-messenger/monitoring/t5-send-stage-trace").T5SendTrace
): Promise<string | null> {
  return (await resolveDirectRoomPeerAndDomain(roomId, viewerUserId, supabase, _t5)).peerUserId;
}

/** 상대 user id + 방 `chat_domain` (D1 차단 적용 범위 판정용) */
export async function resolveDirectRoomPeerAndDomain(
  roomId: string,
  viewerUserId: string,
  supabase?: SupabaseClient<any> | null,
  _t5?: import("@/lib/community-messenger/monitoring/t5-send-stage-trace").T5SendTrace
): Promise<{ peerUserId: string | null; chatDomain: string | null }> {
  const rid = trimText(roomId);
  const viewer = trimText(viewerUserId);
  if (!rid || !viewer) return { peerUserId: null, chatDomain: null };
  const sb = supabase ?? getSupabaseOrNull();
  if (!sb) return { peerUserId: null, chatDomain: null };

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
    let result = await (sb as any)
      .from("community_messenger_rooms")
      .select("room_type, direct_key, chat_domain")
      .eq("id", rid)
      .maybeSingle();
    if (result?.error && isMissingChatDomainColumnError(result.error)) {
      /** chat_domain 미적용 환경 — 기존 조회로 폴백 (차단 검사 유지) */
      result = await (sb as any)
        .from("community_messenger_rooms")
        .select("room_type, direct_key")
        .eq("id", rid)
        .maybeSingle();
    }
    if (_t5 && spanT5) spanT5(_t5, "BG_peer_query_rooms_ms", roomsT0);
    return result;
  })();
  const partsPromise = (async () => {
    const result = await (sb as any)
      .from("community_messenger_participants")
      .select("user_id")
      .eq("room_id", rid);
    if (_t5 && spanT5) spanT5(_t5, "BG_peer_query_participants_ms", partsT0);
    return result;
  })();
  const [{ data: room }, { data: rows }] = await Promise.all([roomPromise, partsPromise]);

  const transformT0 = performance.now();
  const roomType = trimText((room as { room_type?: string } | null)?.room_type);
  const chatDomain = trimText((room as { chat_domain?: string } | null)?.chat_domain) || null;
  if (roomType !== "direct") {
    if (_t5 && spanT5) {
      spanT5(_t5, "BG_peer_transform_ms", transformT0);
      spanT5(_t5, "BG_peer_total_ms", peerTotalT0);
    }
    return { peerUserId: null, chatDomain };
  }

  const peers = dedupeIds(
    ((rows ?? []) as Array<{ user_id?: string | null }>)
      .map((row) => trimText(row.user_id))
      .filter((id) => id && id !== viewer)
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
  return { peerUserId: resolved, chatDomain };
}

function dedupeIds(values: Iterable<string>): string[] {
  return [...new Set([...values].map((v) => trimText(v)).filter(Boolean))];
}

export type DirectRoomBlockDeny = { ok: false; error: "blocked_target"; peerUserId: string };

/** active block row (is_active=true) 가 있으면 메시지 송신 deny — D1: 일반 1:1 만 (trade/store_order 제외) */
export async function assertDirectRoomCommunicationNotBlocked(input: {
  viewerUserId: string;
  roomId: string;
  supabase?: SupabaseClient<any> | null;
  /** Opt-in T5 spans (`x-samarket-t5-trace`). */
  _t5?: import("@/lib/community-messenger/monitoring/t5-send-stage-trace").T5SendTrace;
}): Promise<{ ok: true; peerUserId: string | null } | DirectRoomBlockDeny> {
  const viewer = trimText(input.viewerUserId);
  const roomId = trimText(input.roomId);
  if (!viewer || !roomId) return { ok: true, peerUserId: null };

  const sb = input.supabase ?? getSupabaseOrNull();
  if (!sb) return { ok: true, peerUserId: null };

  const { peerUserId, chatDomain } = await resolveDirectRoomPeerAndDomain(roomId, viewer, sb, input._t5);
  if (!peerUserId) return { ok: true, peerUserId: null };
  /** D1 — 거래·주문 업무 채팅은 사용자 차단과 무관 (다른 가드는 호출 측에서 그대로 적용) */
  if (isUserBlockExemptChatDomain(chatDomain)) return { ok: true, peerUserId };

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
  return { ok: true, peerUserId };
}
