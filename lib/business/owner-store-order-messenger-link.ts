import { buildStoreOrderMessengerRoomHref, storeOrderChatEnsureRedirectHref } from "@/lib/chats/surfaces/order-chat-surface";
import { buildMessengerContextMetaFromStoreOrder } from "@/lib/community-messenger/store-order-messenger-context";
import { buyerOrderStatusLabel } from "@/lib/stores/buyer-order-status-labels";
import type { OwnerStoreOrderListRow } from "@/lib/business/owner-store-order-list-row-bridge";
import { translate } from "@/lib/i18n/messages";
import { getRuntimeAppLanguage } from "@/lib/i18n/runtime-app-language";

export function buildOwnerStoreOrderMessengerContext(
  order: OwnerStoreOrderListRow,
  storeName: string,
  storeId: string
) {
  const firstLine = (order.items ?? [])[0]?.product_title_snapshot?.trim();
  /** 언어 재감사 2026-11-27: 매장·주문 대체어는 화면 언어 키로 (Provider 와 동기화된 런타임 언어) */
  const language = getRuntimeAppLanguage();
  const storeLabel = storeName.trim() || translate(language, "store_owner_store_fallback");
  const headline = `${storeLabel} · ${
    firstLine || translate(language, "store_owner_order_line_short", { no: order.order_no })
  }`;
  return buildMessengerContextMetaFromStoreOrder({
    storeOrderId: order.id,
    orderNo: order.order_no,
    storeId,
    fulfillmentType: order.fulfillment_type,
    productTitle: headline,
    paymentAmount: order.payment_amount,
    orderStatusLabel: buyerOrderStatusLabel(order.order_status, undefined, order.fulfillment_type, (order as { cancel_kind?: unknown }).cancel_kind),
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
