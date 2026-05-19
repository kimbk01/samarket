import { buildStoreOrderMessengerRoomHref, storeOrderChatEnsureRedirectHref } from "@/lib/chats/surfaces/order-chat-surface";
import { buildMessengerContextMetaFromStoreOrder } from "@/lib/community-messenger/store-order-messenger-context";
import { BUYER_ORDER_STATUS_LABEL } from "@/lib/stores/store-order-process-criteria";
import type { OwnerStoreOrderListRow } from "@/lib/business/owner-store-order-list-row-bridge";

export function buildOwnerStoreOrderMessengerContext(
  order: OwnerStoreOrderListRow,
  storeName: string,
  storeId: string
) {
  const firstLine = (order.items ?? [])[0]?.product_title_snapshot?.trim();
  const headline = firstLine
    ? `${storeName.trim() || "매장"} · ${firstLine}`
    : `${storeName.trim() || "매장"} · 주문 ${order.order_no}`;
  return buildMessengerContextMetaFromStoreOrder({
    storeOrderId: order.id,
    orderNo: order.order_no,
    storeId,
    fulfillmentType: order.fulfillment_type,
    productTitle: headline,
    paymentAmount: order.payment_amount,
    orderStatusLabel: BUYER_ORDER_STATUS_LABEL[order.order_status] ?? order.order_status,
  });
}

/** 오너 주문 관리 → 메신저 배달 채팅방(있으면 직행, 없으면 ensure RSC) */
export function ownerStoreOrderChatHref(
  order: OwnerStoreOrderListRow,
  store: { storeId: string; storeName: string }
): string {
  const roomId =
    typeof (order as { community_messenger_room_id?: string | null }).community_messenger_room_id ===
    "string"
      ? (order as { community_messenger_room_id?: string | null }).community_messenger_room_id?.trim()
      : "";
  if (roomId) {
    return buildStoreOrderMessengerRoomHref(roomId, {
      contextMeta: buildOwnerStoreOrderMessengerContext(order, store.storeName, store.storeId),
    });
  }
  return storeOrderChatEnsureRedirectHref(order.id);
}
