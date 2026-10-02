/**
 * WP-6 / CHAT-01 UI — 완료/취소된 주문 채팅 판정(단일 authority).
 *
 * 권위: `snapshot.room.contextMeta.orderStatus` = `store_orders.order_status` raw
 * (types.ts CommunityMessengerRoomContextMetaV1.orderStatus, "completed 판정·readonly").
 * 새 상태/필드/RPC 를 만들지 않고 이 기존 값에서만 terminal 을 판정한다.
 */
export function isTerminalStoreOrderStatus(orderStatus: string | null | undefined): boolean {
  const s = (orderStatus ?? "").toLowerCase().trim();
  return s === "completed" || s === "cancelled";
}
