import type { SharedOrderStatus } from "@/lib/shared-orders/types";
import type { OrderChatFlow } from "./chat-message-builder";

export type OrderChatRoomStatus = "active" | "closed" | "admin_review" | "blocked";

export type OrderChatSenderType = "member" | "owner" | "admin" | "system";

export type OrderChatMessageType = "text" | "image" | "system" | "admin_note";

export interface OrderChatRoom {
  id: string;
  order_id: string;
  order_no: string;
  store_id: string;
  store_name: string;
  buyer_user_id: string;
  buyer_name: string;
  owner_user_id: string;
  owner_name: string;
  /** 샘플/실주문 공통 — 시스템 안내 문구·완료 2줄 분기에 사용 */
  order_flow?: OrderChatFlow;
  room_status: OrderChatRoomStatus;
  last_message: string;
  last_message_at: string;
  unread_count_member: number;
  unread_count_owner: number;
  unread_count_admin: number;
  /** 마지막으로 채팅에 반영한 주문 상태 (시스템 중복 방지) */
  last_chat_order_status: SharedOrderStatus | null;
  created_at: string;
  updated_at: string;
}

export interface OrderChatMessage {
  id: string;
  room_id: string;
  order_id: string;
  sender_type: OrderChatSenderType;
  sender_id: string;
  sender_name: string;
  message_type: OrderChatMessageType;
  content: string;
  image_url: string | null;
  related_order_status: SharedOrderStatus | null;
  is_read_by_member: boolean;
  is_read_by_owner: boolean;
  is_read_by_admin: boolean;
  created_at: string;
}
