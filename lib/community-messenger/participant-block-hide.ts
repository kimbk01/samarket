/**
 * Block → blocker-only direct room inbox hide (F-4 / D2).
 * Messages preserved; communication gated separately via social-relations block.
 * Peer `blocked_hidden_at` is never written here (no bilateral hide / no backfill).
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

  /**
   * D-8: 차단 숨김은 `blocked_hidden_at` 하나만 — 예전에는 `hidden_at`·`last_visible_message_id` 도 써서
   * 차단 해제(blocked_hidden_at 만 지움) 뒤에도 남았다(운영 5행). 두 값은 「차단과 무관한 숨김」 컬럼이라 쓰지 않는다.
   */
  const patch: Record<string, unknown> = {
    blocked_hidden_at: now,
  };

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

/** F-4 / D2 — blocker(viewer) only hides shared general direct rooms from inbox. */
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
    const result = await hideDirectRoomForParticipantUser({
      sb,
      roomId,
      participantUserId: viewer,
      now,
    });
    if (!result.ok) {
      return { ok: false, hiddenRoomIds, error: result.error };
    }
    hiddenRoomIds.push(roomId);
  }

  return { ok: true, hiddenRoomIds };
}

/** F-1 / F-4 — unblock restores inbox visibility for the unblocking viewer only. */
export async function restoreDirectRoomsOnUnblockForViewer(
  viewerUserId: string,
  peerUserId: string
): Promise<{ ok: boolean; restoredRoomIds: string[]; error?: string }> {
  const viewer = trimText(viewerUserId);
  const peer = trimText(peerUserId);
  if (!viewer || !peer) return { ok: false, restoredRoomIds: [], error: "bad_target" };

  const sb = getSupabaseOrNull();
  if (!sb) return { ok: false, restoredRoomIds: [], error: "supabase_unavailable" };

  /**
   * 반대 방향(또는 잔존) 활성 차단이 있으면 복원 금지 — 상대가 나를 차단 중인 방이 다시 보이면 안 된다.
   * 호출 시점: viewer→peer 해제가 저장된 직후이므로 남은 차단은 peer→viewer (또는 legacy) 뿐이다.
   */
  const remaining = await fetchBlockedPairFromSb(sb as any, viewer, peer);
  if (remaining.blockedEitherWay) return { ok: true, restoredRoomIds: [] };

  const roomIds = await resolveDirectRoomIdsForPair(sb, viewer, peer);
  if (!roomIds.length) return { ok: true, restoredRoomIds: [] };

  for (const roomId of roomIds) {
    const result = await restoreDirectRoomForParticipantUser({ sb, roomId, participantUserId: viewer });
    if (!result.ok) {
      return { ok: false, restoredRoomIds: [], error: result.error };
    }
  }

  return { ok: true, restoredRoomIds: roomIds };
}

export function participantViewerBlockedHidden(
  me: { blocked_hidden_at?: string | null; blockedHiddenAt?: string | null } | undefined | null
): boolean {
  if (!me) return false;
  if ("blocked_hidden_at" in me && trimText(me.blocked_hidden_at)) return true;
  if ("blockedHiddenAt" in me && trimText(me.blockedHiddenAt)) return true;
  return false;
}
