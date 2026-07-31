/**
 * `POST /api/me/chats/mark-all-read` 등 — Room Unread Authority v1 QUARANTINE.
 *
 * Counter-only bulk UPDATE unread_count=0 is FORBIDDEN under partial rebuild.
 * New canonical bulk_mark_rooms_read_atomic is not cut over yet.
 * Callers must not treat this as success for CM participants.
 */
import type { SupabaseClient } from "@supabase/supabase-js";
import { ROOM_UNREAD_HEAL_FROZEN } from "@/lib/messenger/contracts/room-unread-authority";

/**
 * @deprecated Room Unread Authority v1 — counter-only bulk mark-all quarantined.
 * Returns skipped:true without writing when ROOM_UNREAD_HEAL_FROZEN.
 */
export async function markAllCommunityMessengerParticipantsReadForUser(
  _sb: SupabaseClient<any>,
  userId: string
): Promise<{ ok: true; skipped?: boolean; quarantined?: boolean } | { ok: false; error: string }> {
  const uid = String(userId).trim();
  if (!uid) return { ok: false, error: "missing_user" };
  if (ROOM_UNREAD_HEAL_FROZEN) {
    console.error("[room_unread_v1] bulk_mark_all_quarantined", { userId: uid });
    return { ok: true, skipped: true, quarantined: true };
  }
  return { ok: false, error: "bulk_mark_all_not_available" };
}
