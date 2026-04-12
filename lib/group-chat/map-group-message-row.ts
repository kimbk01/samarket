import type { ChatMessage } from "@/lib/types/chat";

/** Supabase Realtime `group_messages` 행 → 앱 메시지 */
export function groupMessageRowToChatMessage(
  row: Record<string, unknown> | null | undefined
): ChatMessage | null {
  if (!row || typeof row.id !== "string" || typeof row.room_id !== "string") return null;
  if (row.deleted_at != null) return null;
  if (row.hidden_by_moderator === true) return null;
  const messageType = (row.message_type ?? "text") as ChatMessage["messageType"];
  return {
    id: row.id,
    roomId: row.room_id,
    senderId: String(row.sender_id ?? ""),
    message: typeof row.body === "string" ? row.body : "",
    messageType,
    createdAt: typeof row.created_at === "string" ? row.created_at : "",
    readAt: null,
    isRead: false,
  };
}
