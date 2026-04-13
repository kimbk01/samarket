/** `order_chat_rooms` 전체 행 — 타입은 `OrderChatRoomRow` */
export const ORDER_CHAT_ROOM_ROW_SELECT =
  "id, order_id, order_no, store_id, store_name, buyer_user_id, buyer_name, owner_user_id, owner_name, order_flow, room_status, last_message, last_message_at, unread_count_buyer, unread_count_owner, unread_count_admin, last_chat_order_status, created_at, updated_at";

/** `order_chat_messages` 전체 행 — 타입은 `OrderChatMessageRow` */
export const ORDER_CHAT_MESSAGE_ROW_SELECT =
  "id, room_id, order_id, sender_type, sender_id, sender_name, message_type, content, image_url, related_order_status, is_read_by_buyer, is_read_by_owner, is_read_by_admin, created_at";
