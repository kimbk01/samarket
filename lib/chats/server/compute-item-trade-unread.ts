import type { SupabaseClient } from "@supabase/supabase-js";

const UNREAD_CAP = 99;

/**
 * item_trade 통합방(`chat_messages`) — 참가자 `last_read_message_id` 기준으로
 * 상대 메시지 미읽음 건수(상한 `UNREAD_CAP`). `unread_count` 컬럼과 무관하게 동일 결과를 낸다.
 */
export async function computeItemTradeUnreadCount(
  sbAny: SupabaseClient<any>,
  input: {
    roomId: string;
    viewerUserId: string;
    lastMessageId: string | null | undefined;
    lastReadMessageId: string | null | undefined;
  }
): Promise<number> {
  const roomId = input.roomId.trim();
  const viewer = input.viewerUserId.trim();
  if (!roomId || !viewer) return 0;

  const lm = (input.lastMessageId ?? "").trim();
  if (!lm) return 0;

  const { data: lmRow } = await sbAny.from("chat_messages").select("sender_id").eq("id", lm).maybeSingle();
  const lastSender = (lmRow as { sender_id?: string | null } | null)?.sender_id ?? null;
  if (lastSender === viewer) return 0;

  const lr = (input.lastReadMessageId ?? "").trim();
  if (lr === lm) return 0;

  if (!lr) {
    const { count, error } = await sbAny
      .from("chat_messages")
      .select("id", { count: "exact", head: true })
      .eq("room_id", roomId)
      .neq("sender_id", viewer);
    if (error) return 0;
    return Math.min(UNREAD_CAP, count ?? 0);
  }

  const { data: lrRow } = await sbAny.from("chat_messages").select("created_at").eq("id", lr).maybeSingle();
  const lrAt = (lrRow as { created_at?: string | null } | null)?.created_at;
  if (!lrAt) {
    const { count, error } = await sbAny
      .from("chat_messages")
      .select("id", { count: "exact", head: true })
      .eq("room_id", roomId)
      .neq("sender_id", viewer);
    if (error) return 0;
    return Math.min(UNREAD_CAP, count ?? 0);
  }

  const { count, error } = await sbAny
    .from("chat_messages")
    .select("id", { count: "exact", head: true })
    .eq("room_id", roomId)
    .neq("sender_id", viewer)
    .gt("created_at", lrAt);

  if (error) return 0;
  return Math.min(UNREAD_CAP, count ?? 0);
}
