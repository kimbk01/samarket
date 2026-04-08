/**
 * 통합 채팅 UI(ChatDetailView)에서 store_order 방일 때
 * `chat_messages`가 아닌 주문 전용 `order_chat_messages` 스냅샷을 사용한다.
 */
import type { ChatMessage } from "@/lib/types/chat";
import type { OrderChatMessagePublic } from "@/lib/order-chat/types";
import { forgetSingleFlight, runSingleFlight } from "@/lib/http/run-single-flight";

const orderChatSnapshotKey = (orderId: string) => `chat:order-chat-snapshot:${orderId}`;

export function bustOrderChatMessagesSingleFlight(orderId: string): void {
  const oid = orderId.trim();
  if (!oid) return;
  forgetSingleFlight(orderChatSnapshotKey(oid));
}

export function mapOrderChatMessageToChatMessage(
  m: OrderChatMessagePublic,
  uiRoomId: string,
  roomBuyerId: string,
  currentUserId: string
): ChatMessage {
  const messageType: ChatMessage["messageType"] =
    m.message_type === "image"
      ? "image"
      : m.message_type === "system" || m.message_type === "admin_note"
        ? "system"
        : "text";
  const isCurrentBuyer = currentUserId === roomBuyerId;
  const isRead = isCurrentBuyer ? m.is_read_by_buyer : m.is_read_by_owner;
  return {
    id: m.id,
    roomId: uiRoomId,
    senderId: m.sender_id ?? "",
    senderNickname: m.sender_name?.trim() ? m.sender_name : null,
    message: m.content ?? "",
    messageType,
    imageUrl: m.image_url,
    isRead,
    readAt: null,
    createdAt: m.created_at ?? "",
  };
}

/** GET /api/order-chat/orders/:orderId → messages 를 ChatMessage[] 로 (동시 호출 합류) */
export function fetchOrderChatMessagesForUnifiedRoom(
  orderId: string,
  uiRoomId: string,
  roomBuyerId: string,
  currentUserId: string
): Promise<ChatMessage[]> {
  const oid = orderId.trim();
  if (!oid) return Promise.resolve([]);
  const key = orderChatSnapshotKey(oid);
  return runSingleFlight(key, async () => {
    try {
      const res = await fetch(`/api/order-chat/orders/${encodeURIComponent(oid)}`, {
        credentials: "include",
        cache: "no-store",
      });
      const json = (await res.json().catch(() => ({}))) as {
        ok?: boolean;
        messages?: OrderChatMessagePublic[];
      };
      if (!res.ok || json.ok !== true || !Array.isArray(json.messages)) {
        return [];
      }
      return json.messages.map((row) =>
        mapOrderChatMessageToChatMessage(row, uiRoomId, roomBuyerId, currentUserId)
      );
    } catch {
      return [];
    }
  });
}
