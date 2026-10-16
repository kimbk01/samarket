import "server-only";

import type { SupabaseClient } from "@supabase/supabase-js";
import {
  buildMessengerAutoSaveCandidatesQuery,
  chunkMessengerAutoSaveRoomIds,
  filterMessengerAutoSaveCandidateRows,
  messengerAutoSaveMessageFromRow,
  MESSENGER_IMAGE_AUTO_SAVE_CANDIDATES_LIMIT,
  MESSENGER_IMAGE_AUTO_SAVE_CANDIDATES_MAX_ROOMS,
  selectMessengerAutoSaveCandidateRooms,
} from "@/lib/community-messenger/attachment/messenger-image-auto-save-candidates";
import type { CommunityMessengerMessage } from "@/lib/community-messenger/types";

/**
 * 미디어 자동 저장 후보 조회 (읽기 전용, 서비스 롤).
 * 범위는 **시청자 참여 행**으로만 한정한다: participants(user_id = viewer, left_at null) → room_id 청크 →
 * messages(image, 삭제 아님, sender ≠ viewer, created_at ≥ since) 오름차순. 쓰기 없음.
 */
export async function listMessengerImageAutoSaveCandidates(
  sb: SupabaseClient<any>,
  input: { viewerUserId: string; sinceIso: string },
): Promise<{ ok: true; messages: CommunityMessengerMessage[]; hasMore: boolean } | { ok: false; error: string }> {
  const viewer = input.viewerUserId.trim();
  if (!viewer) return { ok: false, error: "viewer_required" };

  const { data: participantRows, error: pErr } = await (sb as any)
    .from("community_messenger_participants")
    .select("room_id, left_at, cleared_at, blocked_hidden_at")
    .eq("user_id", viewer)
    .is("left_at", null)
    .limit(MESSENGER_IMAGE_AUTO_SAVE_CANDIDATES_MAX_ROOMS);
  if (pErr) return { ok: false, error: String(pErr.message ?? "participants_query_failed") };

  const { roomIds, clearedAtMsByRoom } = selectMessengerAutoSaveCandidateRooms(
    (participantRows ?? []) as Array<Record<string, unknown>>,
  );
  if (roomIds.length === 0) return { ok: true, messages: [], hasMore: false };

  const chunks = chunkMessengerAutoSaveRoomIds(roomIds);
  const results = await Promise.all(
    chunks.map((chunk) =>
      buildMessengerAutoSaveCandidatesQuery((sb as any).from("community_messenger_messages"), {
        roomIds: chunk,
        viewerUserId: viewer,
        sinceIso: input.sinceIso,
      }),
    ),
  );
  const rows: Array<Record<string, unknown>> = [];
  let chunkHasMore = false;
  for (const r of results as Array<{ data?: unknown; error?: { message?: string } | null }>) {
    if (r.error) return { ok: false, error: String(r.error.message ?? "messages_query_failed") };
    const list = Array.isArray(r.data) ? (r.data as Array<Record<string, unknown>>) : [];
    if (list.length > MESSENGER_IMAGE_AUTO_SAVE_CANDIDATES_LIMIT) chunkHasMore = true;
    rows.push(...list);
  }
  const filtered = filterMessengerAutoSaveCandidateRows(rows, {
    viewerUserId: viewer,
    sinceMs: Date.parse(input.sinceIso),
    allowedRoomIds: new Set(roomIds),
    clearedAtMsByRoom,
  });
  const messages: CommunityMessengerMessage[] = [];
  for (const row of filtered.rows) {
    const m = messengerAutoSaveMessageFromRow(row, viewer);
    if (m) messages.push(m);
  }
  return { ok: true, messages, hasMore: filtered.hasMore || chunkHasMore };
}
