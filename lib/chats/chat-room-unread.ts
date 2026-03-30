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
) {
  const { data: participants } = await sb
    .from("chat_room_participants")
    .select("user_id, unread_count")
    .eq("room_id", roomId)
    .eq("hidden", false)
    .is("left_at", null)
    .eq("is_active", true);

  const rows = (participants ?? []) as RecipientRow[];
  const recipients = rows.filter((row) => row.user_id && row.user_id !== senderUserId);
  await Promise.all(
    recipients.map(async (row) => {
      const current = Number(row.unread_count ?? 0);
      await sb
        .from("chat_room_participants")
        .update({
          unread_count: current + 1,
          hidden: false,
          left_at: null,
          updated_at: nowIso,
        })
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
}
