import type { OrderChatSnapshot } from "@/lib/order-chat/types";

/**
 * 매장 주문 연동 채팅 — 스냅샷 조회 포트.
 * 식별자는 **주문 id** (`order_chat_rooms.order_id` / REST `.../orders/[orderId]`).
 */
export type OrderChatSnapshotResult =
  | { ok: true; snapshot: OrderChatSnapshot }
  | { ok: false; error: string; status: number };

export type OrderChatSnapshotLoadOptions = {
  /** 최근 N개만 (오래된 순 정렬). 미지정 시 전체 */
  messageLimit?: number;
};

export interface OrderChatReadPort {
  getSnapshotForOrder(
    userId: string,
    orderId: string,
    opts?: OrderChatSnapshotLoadOptions
  ): Promise<OrderChatSnapshotResult>;
}
