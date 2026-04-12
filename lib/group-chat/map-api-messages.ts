import type { ChatMessage } from "@/lib/types/chat";

/** GET bootstrap / GET messages API 한 줄 → `ChatMessage` */
export function mapGroupApiRowToChatMessage(
  row: Record<string, unknown>,
  roomId: string
): ChatMessage {
  const mt = (row.messageType ?? row.message_type ?? "text") as ChatMessage["messageType"];
  return {
    id: String(row.id ?? ""),
    roomId,
    senderId: String(row.senderId ?? row.sender_id ?? ""),
    message: typeof row.body === "string" ? row.body : "",
    messageType: mt,
    createdAt: typeof row.createdAt === "string" ? row.createdAt : String(row.created_at ?? ""),
    isRead: false,
    readAt: null,
  };
}
