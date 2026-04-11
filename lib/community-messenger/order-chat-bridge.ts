import type { OrderChatRoomPublic } from "@/lib/order-chat/types";
import type { SharedOrderStatus } from "@/lib/shared-orders/types";
import { orderStatusTextForRole } from "@/lib/shared-orders/order-status-text";
import { BUYER_ORDER_STATUS_LABEL } from "@/lib/stores/store-order-process-criteria";
import { buildCommunityMessengerRoomUrlWithContext } from "@/lib/community-messenger/cm-ctx-url";
import { buildMessengerContextMetaFromStoreOrder } from "@/lib/community-messenger/store-order-messenger-context";
import type { CommunityMessengerRoomContextMetaV1 } from "@/lib/community-messenger/types";

function orderStatusStepLabel(orderStatus: SharedOrderStatus): string {
  const short = BUYER_ORDER_STATUS_LABEL[orderStatus];
  if (typeof short === "string" && short.trim()) return short;
  return orderStatusTextForRole(orderStatus, "member");
}

/** 주문 채팅 스냅샷 → 메신저 목록용 contextMeta (v1). */
export function buildMessengerContextMetaFromOrderChatSnapshot(
  room: OrderChatRoomPublic,
  orderStatus: SharedOrderStatus
): CommunityMessengerRoomContextMetaV1 {
  const fulfillmentType = room.order_flow === "delivery" ? "local_delivery" : "pickup";
  const headline = `${room.store_name} · 주문 ${room.order_no}`;
  return buildMessengerContextMetaFromStoreOrder({
    fulfillmentType,
    productTitle: headline,
    orderStatusLabel: orderStatusStepLabel(orderStatus),
    thumbnailUrl: null,
    paymentAmount: null,
  });
}

export function peerUserIdForMessengerFromOrderChat(role: "buyer" | "owner", room: OrderChatRoomPublic): string {
  return role === "buyer" ? room.owner_user_id : room.buyer_user_id;
}

/**
 * 1:1 메신저 방을 준비하고 `cm_ctx` 딥링크 URL을 반환한다.
 * 실패 시 `friend_required`(친구 관계 필요)·`blocked_target` 등 서버 error 코드를 그대로 돌린다.
 */
export async function createCommunityMessengerDeepLinkFromOrderChat(input: {
  role: "buyer" | "owner";
  room: OrderChatRoomPublic;
  orderStatus: SharedOrderStatus;
}): Promise<{ ok: true; href: string } | { ok: false; error: string }> {
  const meta = buildMessengerContextMetaFromOrderChatSnapshot(input.room, input.orderStatus);
  const res = await fetch("/api/community-messenger/rooms", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    credentials: "include",
    body: JSON.stringify({ roomType: "direct", storeOrderId: input.room.order_id }),
  });
  const json = (await res.json().catch(() => ({}))) as {
    ok?: boolean;
    roomId?: string;
    error?: string;
  };
  if (!res.ok || !json.ok || !json.roomId) {
    return { ok: false, error: typeof json.error === "string" ? json.error : "room_failed" };
  }
  return { ok: true, href: buildCommunityMessengerRoomUrlWithContext(json.roomId, meta) };
}
