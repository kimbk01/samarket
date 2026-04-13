import type { SupabaseClient } from "@supabase/supabase-js";

function isMissingRelationError(err: unknown): boolean {
  const e = err as { code?: string; message?: string };
  const m = String(e?.message ?? "").toLowerCase();
  return e?.code === "42P01" || (m.includes("relation") && m.includes("does not exist"));
}

/**
 * `POST /api/me/chats/mark-all-read` 등에서 사용 — 거래(chat_rooms)와 별도인
 * `community_messenger_participants` 미읽음을 일괄 0으로 맞춘다.
 * (메시지 행 read_at 은 CM이 participant unread 중심이라 여기서는 집계만 정합.)
 */
export async function markAllCommunityMessengerParticipantsReadForUser(
  sb: SupabaseClient<any>,
  userId: string
): Promise<{ ok: true; skipped?: boolean } | { ok: false; error: string }> {
  const uid = String(userId).trim();
  if (!uid) return { ok: false, error: "missing_user" };
  const now = new Date().toISOString();
  const { error } = await sb
    .from("community_messenger_participants")
    .update({ unread_count: 0, last_read_at: now })
    .eq("user_id", uid);
  if (error) {
    if (isMissingRelationError(error)) return { ok: true, skipped: true };
    return { ok: false, error: error.message };
  }
  return { ok: true };
}
