import type { ChatMessage } from "@/lib/types/chat";
import { parseProductChatImageContent } from "@/lib/chats/chat-image-bundle";

/** Realtime·DB 행 → `ChatMessage` (product_chat_messages) */
export function mapProductChatMessageRow(m: Record<string, unknown>): ChatMessage | null {
  const id = m.id;
  const productChatId = m.product_chat_id;
  if (typeof id !== "string" || typeof productChatId !== "string") return null;
  if (m.is_hidden === true) return null;

  const mt = ((m.message_type as string) || "text") as "text" | "image" | "system";
  const rawContent = (m.content as string) ?? "";
  const rawUrl = (m.image_url as string | null | undefined) ?? null;
  let messageText = rawContent;
  let imageUrl: string | null = rawUrl;
  let imageUrls: string[] | undefined;
  if (mt === "image") {
    const parsed = parseProductChatImageContent(rawContent, rawUrl);
    messageText = parsed.caption;
    imageUrl = parsed.urls[0] ?? null;
    imageUrls = parsed.urls.length > 1 ? parsed.urls : undefined;
  }
  const senderId = m.sender_id;
  const senderStr =
    typeof senderId === "string" && senderId.trim()
      ? senderId.trim()
      : mt === "system"
        ? ""
        : null;
  if (senderStr === null) return null;

  return {
    id,
    roomId: productChatId,
    senderId: senderStr,
    message: messageText,
    messageType: mt,
    imageUrl,
    imageUrls,
    readAt: (m.read_at as string | null) ?? null,
    createdAt: (m.created_at as string) ?? "",
    isRead: !!m.read_at,
  };
}
