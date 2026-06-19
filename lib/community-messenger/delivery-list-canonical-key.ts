/**
 * 배달·주문 채팅 목록 dedupe — 주문 1건당 1행 (`store_order:{orderId}` canonical).
 */
import type { CommunityMessengerRoomSummary } from "@/lib/community-messenger/types";
import { resolveCommunityMessengerDeliveryContextMeta } from "@/lib/community-messenger/room-context-meta";

function trimId(v: unknown): string {
  return typeof v === "string" ? v.trim() : "";
}

/** `store_order:` / `trade_order:` direct_key 에서 order id 추출 */
export function parseStoreOrderIdFromMessengerDirectKey(directKey: string | null | undefined): string | null {
  const dk = trimId(directKey);
  if (!dk) return null;
  if (dk.startsWith("store_order:")) {
    const id = dk.slice("store_order:".length).trim();
    return id || null;
  }
  if (dk.startsWith("trade_order:")) {
    const id = dk.slice("trade_order:".length).trim();
    return id || null;
  }
  return null;
}

function resolveDeliveryOrderId(summary: CommunityMessengerRoomSummary): string | null {
  const meta = resolveCommunityMessengerDeliveryContextMeta(summary);
  const fromMeta = trimId(meta?.storeOrderId);
  if (fromMeta) return fromMeta;
  return parseStoreOrderIdFromMessengerDirectKey(summary.messengerDirectKey);
}

function roomIsDeliverySummary(summary: CommunityMessengerRoomSummary): boolean {
  return resolveCommunityMessengerDeliveryContextMeta(summary) != null;
}

/**
 * 배달 목록 dedupe 그룹 키.
 * 1. delivery:{orderId}
 * 2. room:{roomId}
 */
export function deliveryMessengerListCanonicalKey(summary: CommunityMessengerRoomSummary): string | null {
  if (!roomIsDeliverySummary(summary)) return null;
  const orderId = resolveDeliveryOrderId(summary);
  if (orderId) return `delivery:${orderId}`;
  const roomId = trimId(summary.id);
  return roomId ? `room:${roomId}` : null;
}

export function deliveryDirectKeyIsCanonicalStoreOrder(directKey: string | null | undefined): boolean {
  return trimId(directKey).startsWith("store_order:");
}
