import type { OrderChatReadPort } from "@/lib/chat-domain/ports/order-chat-read";
import type { SupabaseClient } from "@supabase/supabase-js";
import { getOrderChatSnapshotForUser } from "@/lib/order-chat/service";

/** `OrderChatReadPort` — Supabase `order-chat` 서비스 구현 */
export function createOrderChatReadAdapter(
  sb: SupabaseClient<any>
): OrderChatReadPort {
  return {
    getSnapshotForOrder(userId, orderId) {
      return getOrderChatSnapshotForUser(sb, orderId, userId);
    },
  };
}
