/**
 * Block → **차단한 쪽(blocker)** 의 일반 1:1 방만 목록에서 숨긴다 (Owner 결정 D2 · 2026-10-21).
 * 차단당한 쪽 참여 행은 건드리지 않는다 — 차단 사실 노출 최소화 (스키마 설명「viewer-only」).
 * 메시지는 보존되고, 송수신·통화는 social-relations 차단 가드가 별도로 막는다.
 */

import { getSupabaseServer } from "@/lib/chat/supabase-server";
import { messengerDirectKeyForUserPair } from "@/lib/community-messenger/messenger-room-domain";
import { tryCreateSupabaseServiceClient } from "@/lib/supabase/try-supabase-server";
import { fetchBlockedPairFromSb } from "@/lib/social/user-block-ssot";

function trimText(value: unknown): string {
  return typeof value === "string" ? value.trim() : "";
}

function getSupabaseOrNull() {
  try {
    return getSupabaseServer();
  } catch {
    return tryCreateSupabaseServiceClient();
  }
}

function isMissingColumnError(error: unknown): boolean {
  const msg = String((error as { message?: unknown })?.message ?? "");
  return /does not exist|42703|blocked_hidden_at/i.test(msg);
}

/** 차단 숨김 대상 — pair 일반 1:1 DM 만 (거래·주문·그룹 도메인 제외, chat_domain NULL = legacy 일반 DM). */
export const BLOCK_HIDE_GENERAL_DIRECT_CHAT_DOMAIN_FILTER = "chat_domain.is.null,chat_domain.eq.general_direct";

/**
 * viewer↔peer 의 **일반 direct room** 만 반환한다.
 * - `room_type='direct'` AND `direct_key = messengerDirectKeyForUserPair` AND chat_domain ∈ {NULL, general_direct}
 * - 클라이언트 roomId 힌트는 같은 조건을 만족할 때만 사용 (검증 없는 힌트·공유 참여 방 fallback 금지 —
 *   거래/주문 direct 방이 차단 숨김에 휘말리지 않도록).
 */
export async function resolveDirectRoomIdsForPair(
  sb: NonNullable<ReturnType<typeof getSupabaseOrNull>>,
  viewerUserId: string,
  peerUserId: string,
  roomIdHint?: string
): Promise<string[]> {
  const directKey = messengerDirectKeyForUserPair(viewerUserId, peerUserId);
  if (!directKey) return [];

  const baseQuery = () =>
    (sb as any)
      .from("community_messenger_rooms")
      .select("id")
      .eq("room_type", "direct")
      .eq("direct_key", directKey);

  let { data: byKey, error } = await baseQuery().or(BLOCK_HIDE_GENERAL_DIRECT_CHAT_DOMAIN_FILTER);
  if (error && isMissingColumnError(error)) {
    /** chat_domain 컬럼 미적용 환경 — pair direct_key 로만 판정 (commerce 키는 접두사로 이미 분리) */
    ({ data: byKey, error } = await baseQuery());
  }
  if (error) return [];

  const ids = new Set(
    ((byKey ?? []) as Array<{ id?: string }>).map((row) => trimText(row.id)).filter(Boolean)
  );

  const hint = trimText(roomIdHint);
  if (hint && ids.has(hint)) return [hint];
  return [...ids];
}

/** viewer↔peer 일반 1:1 DM room id 목록 (서버 전용, 차단 부수효과용). */
export async function listGeneralDirectRoomIdsForPair(
  viewerUserId: string,
  peerUserId: string
): Promise<string[]> {
  const viewer = trimText(viewerUserId);
  const peer = trimText(peerUserId);
  if (!viewer || !peer || viewer === peer) return [];
  const sb = getSupabaseOrNull();
  if (!sb) return [];
  return resolveDirectRoomIdsForPair(sb, viewer, peer);
}

async function hideDirectRoomForParticipantUser(input: {
  sb: NonNullable<ReturnType<typeof getSupabaseOrNull>>;
  roomId: string;
  participantUserId: string;
  now: string;
}): Promise<{ ok: boolean; error?: string }> {
  const { sb, roomId, participantUserId, now } = input;

  const { data: roomRow } = await (sb as any)
    .from("community_messenger_rooms")
    .select("id, room_type")
    .eq("id", roomId)
    .maybeSingle();
  if (trimText(roomRow?.room_type) !== "direct") return { ok: true };

  const { data: lastMsg } = await (sb as any)
    .from("community_messenger_messages")
    .select("id")
    .eq("room_id", roomId)
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();

  const patch: Record<string, unknown> = {
    blocked_hidden_at: now,
    hidden_at: now,
  };
  const lastVisibleId = trimText(lastMsg?.id);
  if (lastVisibleId) patch.last_visible_message_id = lastVisibleId;

  const { error } = await (sb as any)
    .from("community_messenger_participants")
    .update(patch)
    .eq("room_id", roomId)
    .eq("user_id", participantUserId);

  if (error) {
    if (isMissingColumnError(error)) {
      return { ok: false, error: "migration_required" };
    }
    return { ok: false, error: String(error.message ?? "block_hide_failed") };
  }

  return { ok: true };
}

async function restoreDirectRoomForParticipantUser(input: {
  sb: NonNullable<ReturnType<typeof getSupabaseOrNull>>;
  roomId: string;
  participantUserId: string;
}): Promise<{ ok: boolean; error?: string }> {
  const { sb, roomId, participantUserId } = input;

  const { error } = await (sb as any)
    .from("community_messenger_participants")
    .update({ blocked_hidden_at: null })
    .eq("room_id", roomId)
    .eq("user_id", participantUserId)
    .not("blocked_hidden_at", "is", null);

  if (error) {
    if (isMissingColumnError(error)) return { ok: true };
    return { ok: false, error: String(error.message ?? "unblock_restore_failed") };
  }

  return { ok: true };
}

/** D2 — 차단한 사람(viewer) 의 참여 행만 숨긴다. peer(차단당한 쪽) 행은 변경하지 않는다. */
export async function hideDirectRoomsOnBlockForViewer(input: {
  viewerUserId: string;
  peerUserId: string;
  roomId?: string;
}): Promise<{ ok: boolean; hiddenRoomIds: string[]; error?: string }> {
  const viewer = trimText(input.viewerUserId);
  const peer = trimText(input.peerUserId);
  if (!viewer || !peer || viewer === peer) return { ok: false, hiddenRoomIds: [], error: "bad_target" };

  const sb = getSupabaseOrNull();
  if (!sb) return { ok: false, hiddenRoomIds: [], error: "supabase_unavailable" };

  const roomIds = await resolveDirectRoomIdsForPair(sb, viewer, peer, input.roomId);
  if (!roomIds.length) return { ok: true, hiddenRoomIds: [] };

  const now = new Date().toISOString();
  const hiddenRoomIds: string[] = [];

  for (const roomId of roomIds) {
    const result = await hideDirectRoomForParticipantUser({ sb, roomId, participantUserId: viewer, now });
    if (!result.ok) {
      return { ok: false, hiddenRoomIds, error: result.error };
    }
    hiddenRoomIds.push(roomId);
  }

  return { ok: true, hiddenRoomIds };
}

/**
 * 차단 해제 → 참여 행별로 「그 참여자가 상대를 차단 중이 아니면」 blocked_hidden_at 을 지운다 (D2 와 같은 규칙).
 * - viewer(해제한 사람): viewer→peer 차단이 남아 있지 않으면 복원 (peer→viewer 차단이 있어도 내 목록에는 보인다 — 차단당한 쪽은 숨기지 않음).
 * - peer: 예전 양방향 숨김(D2 이전) 잔재 정리 — peer→viewer 차단이 없을 때만 복원.
 */
export async function restoreDirectRoomsOnUnblockForViewer(
  viewerUserId: string,
  peerUserId: string
): Promise<{ ok: boolean; restoredRoomIds: string[]; error?: string }> {
  const viewer = trimText(viewerUserId);
  const peer = trimText(peerUserId);
  if (!viewer || !peer) return { ok: false, restoredRoomIds: [], error: "bad_target" };

  const sb = getSupabaseOrNull();
  if (!sb) return { ok: false, restoredRoomIds: [], error: "supabase_unavailable" };

  /** 호출 시점: viewer→peer 해제가 저장된 직후 — 남은 차단(legacy 포함)을 방향별로 본다. */
  const remaining = await fetchBlockedPairFromSb(sb as any, viewer, peer);
  const participantUserIds = [
    ...(remaining.blockedByMe ? [] : [viewer]),
    ...(remaining.blockedByPeer ? [] : [peer]),
  ];
  if (!participantUserIds.length) return { ok: true, restoredRoomIds: [] };

  const roomIds = await resolveDirectRoomIdsForPair(sb, viewer, peer);
  if (!roomIds.length) return { ok: true, restoredRoomIds: [] };

  for (const roomId of roomIds) {
    for (const participantUserId of participantUserIds) {
      const result = await restoreDirectRoomForParticipantUser({ sb, roomId, participantUserId });
      if (!result.ok) {
        return { ok: false, restoredRoomIds: [], error: result.error };
      }
    }
  }

  return { ok: true, restoredRoomIds: remaining.blockedByMe ? [] : roomIds };
}

export function participantViewerBlockedHidden(
  me: { blocked_hidden_at?: string | null; blockedHiddenAt?: string | null } | undefined | null
): boolean {
  if (!me) return false;
  if ("blocked_hidden_at" in me && trimText(me.blocked_hidden_at)) return true;
  if ("blockedHiddenAt" in me && trimText(me.blockedHiddenAt)) return true;
  return false;
}
