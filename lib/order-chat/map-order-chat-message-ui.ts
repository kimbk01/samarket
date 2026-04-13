import type { OrderChatMessagePublic } from "@/lib/order-chat/types";
import type { OrderChatMessage } from "@/lib/shared-order-chat/types";

/** DB `sender_type` buyer → UI `member` (버블 정렬) */
export function mapOrderChatMessagePublicToUi(m: OrderChatMessagePublic): OrderChatMessage {
  const sender_type: OrderChatMessage["sender_type"] =
    m.sender_type === "buyer"
      ? "member"
      : m.sender_type === "owner"
        ? "owner"
        : m.sender_type === "admin"
          ? "admin"
          : "system";
  return {
    id: m.id,
    room_id: m.room_id,
    order_id: m.order_id,
    sender_type,
    sender_id: m.sender_id ?? "",
    sender_name: m.sender_name,
    message_type: m.message_type as OrderChatMessage["message_type"],
    content: m.content,
    image_url: m.image_url,
    related_order_status: m.related_order_status,
    is_read_by_member: m.is_read_by_buyer,
    is_read_by_owner: m.is_read_by_owner,
    is_read_by_admin: m.is_read_by_admin,
    created_at: m.created_at,
  };
}
