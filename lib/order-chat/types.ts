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

export type OrderChatSnapshot = {
  room: OrderChatRoomPublic;
  role: OrderChatRole;
  orderStatus: SharedOrderStatus;
  messages: OrderChatMessagePublic[];
};
