import type {
  OrderChatReadPort,
  OrderChatSnapshotLoadOptions,
  OrderChatSnapshotResult,
} from "../ports/order-chat-read";

/** BFF `GET .../order-chat/orders/:orderId` — 도메인 포트만 의존 */
export async function loadOrderChatSnapshotForOrder(
  port: OrderChatReadPort,
  userId: string,
  orderId: string,
  opts?: OrderChatSnapshotLoadOptions
): Promise<OrderChatSnapshotResult> {
  return port.getSnapshotForOrder(userId, orderId, opts);
}
