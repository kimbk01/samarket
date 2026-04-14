import type { SharedOrderStatus } from "@/lib/shared-orders/types";
import type { OrderChatFlow } from "@/lib/shared-order-chat/chat-message-builder";

export type OrderChatRole = "buyer" | "owner";
export type OrderChatRoomStatus = "active" | "closed" | "admin_review" | "blocked";
export type OrderChatSenderType = "buyer" | "owner" | "admin" | "system";
export type OrderChatMessageType = "text" | "image" | "system" | "admin_note";

export type OrderChatRoomRow = {
  id: string;
  order_id: string;
  order_no: string;
  store_id: string;
  store_name: string;
  buyer_user_id: string;
  buyer_name: string;
  owner_user_id: string;
  owner_name: string;
  order_flow: OrderChatFlow;
  room_status: OrderChatRoomStatus;
  last_message: string;
  last_message_at: string;
  unread_count_buyer: number;
  unread_count_owner: number;
  unread_count_admin: number;
  last_chat_order_status: SharedOrderStatus | null;
  created_at: string;
  updated_at: string;
};

export type OrderChatParticipantRow = {
  id: string;
  room_id: string;
  user_id: string;
  role: OrderChatRole;
  unread_count: number;
  last_read_message_id: string | null;
  last_read_at: string | null;
  is_active: boolean;
  created_at: string;
  updated_at: string;
};

export type OrderChatMessageRow = {
  id: string;
  room_id: string;
  order_id: string;
  sender_type: OrderChatSenderType;
  sender_id: string | null;
  sender_name: string;
  message_type: OrderChatMessageType;
  content: string;
  image_url: string | null;
  related_order_status: SharedOrderStatus | null;
  is_read_by_buyer: boolean;
  is_read_by_owner: boolean;
  is_read_by_admin: boolean;
  created_at: string;
};

export type OrderChatRoomPublic = OrderChatRoomRow;
export type OrderChatMessagePublic = OrderChatMessageRow;

/** RSC·첫 페인트용 최근 메시지 개수 — 전체는 API GET 또는 `messagesCapped` 보강 */
export const ORDER_CHAT_SNAPSHOT_BOOTSTRAP_MESSAGE_LIMIT = 48;

export type OrderChatSnapshot = {
  room: OrderChatRoomPublic;
  role: OrderChatRole;
  orderStatus: SharedOrderStatus;
  messages: OrderChatMessagePublic[];
  /** true면 더 오래된 메시지가 있을 수 있음 — 클라이언트에서 전체 스냅샷으로 한 번 보강 */
  messagesCapped?: boolean;
};
