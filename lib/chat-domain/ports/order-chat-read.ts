import type { OrderChatSnapshot } from "@/lib/order-chat/types";

/**
 * 매장 주문 연동 채팅 — 스냅샷 조회 포트.
 * 식별자는 **주문 id** (`order_chat_rooms.order_id` / REST `.../orders/[orderId]`).
 */
export type OrderChatSnapshotResult =
  | { ok: true; snapshot: OrderChatSnapshot }
  | { ok: false; error: string; status: number };

export interface OrderChatReadPort {
  getSnapshotForOrder(
    userId: string,
    orderId: string
  ): Promise<OrderChatSnapshotResult>;
}
