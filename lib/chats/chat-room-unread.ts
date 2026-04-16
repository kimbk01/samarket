import type { SupabaseClient } from "@supabase/supabase-js";

type RecipientRow = {
  user_id: string;
  unread_count?: number | null;
};

export async function bumpUnreadForChatRoomRecipients(
  sb: SupabaseClient<any>,
  roomId: string,
  senderUserId: string,
  nowIso: string,
  preview: string
): Promise<{ recipientUserIds: string[] }> {
  const { data: roomMeta } = await sb.from("chat_rooms").select("room_type").eq("id", roomId).maybeSingle();
  const roomType = (roomMeta as { room_type?: string | null } | null)?.room_type ?? "";
  /** item_trade 는 `last_read_message_id` 기반 계산으로 통일 — unread_count 증가 생략 */
  const skipUnreadCounter = roomType === "item_trade";

  const { data: participants } = await sb
    .from("chat_room_participants")
    .select("user_id, unread_count")
    .eq("room_id", roomId)
    .eq("hidden", false)
    .is("left_at", null)
    /** RLS·participantRowActive 와 동일: false 만 비활성, null 은 활성으로 간주 */
    .or("is_active.is.null,is_active.eq.true");

  const rows = (participants ?? []) as RecipientRow[];
  const recipients = rows.filter((row) => row.user_id && row.user_id !== senderUserId);
  const recipientUserIds = recipients.map((r) => r.user_id).filter(Boolean) as string[];
  await Promise.all(
    recipients.map(async (row) => {
      await sb
        .from("chat_room_participants")
        .update(
          skipUnreadCounter
            ? {
                hidden: false,
                left_at: null,
                updated_at: nowIso,
              }
            : {
                unread_count: Number(row.unread_count ?? 0) + 1,
                hidden: false,
                left_at: null,
                updated_at: nowIso,
              }
        )
        .eq("room_id", roomId)
        .eq("user_id", row.user_id);
      try {
        await sb.from("notification_logs").insert({
          room_id: roomId,
          user_id: row.user_id,
          notification_type: "new_message",
          delivery_channel: "push",
          status: "queued",
          payload_summary: preview,
          created_at: nowIso,
        });
      } catch {
        /* ignore */
      }
    })
  );
  return { recipientUserIds };
}
