/**
 * 배달·주문 채팅 전용 목록 행 — `CommunityMessengerRoomSummary` → 매장·주문·상태·시간 표시 필드.
 */
import { communityMessengerRoomIsConfirmedDelivery } from "@/lib/community-messenger/messenger-room-domain";
import {
  parseStoreNameFromDeliveryHeadline,
  resolveStoreOrderDisplayIdentity,
  STORE_ORDER_DISPLAY_STORE_FALLBACK,
} from "@/lib/community-messenger/store-order-display-identity";
import type { CommunityMessengerRoomSummary } from "@/lib/community-messenger/types";
import type { MessageKey } from "@/lib/i18n/messages";
import {
  resolveDeliveryChatListFulfillmentType,
  resolveDeliveryChatListOrderStatusRaw,
} from "@/lib/community-messenger/delivery-chat-list/delivery-chat-list-resolve";
import { deliveryChatListStatusBadgePresentation } from "@/lib/community-messenger/delivery-chat-list/delivery-chat-list-status-badge";

export type DeliveryChatListTranslate = (key: MessageKey, vars?: Record<string, string | number>) => string;

export type DeliveryChatListRowModel = {
  storeId: string | null;
  storeName: string;
  orderStatusLabel: string | null;
  storeThumbnailUrl: string | null;
  statusBadgeClassName: string;
};

/** `{store} · 주문 {orderNo}` 등 headline 에서 매장명만 추출(레거시 meta 폴백) */
export function parseStoreDisplayNameFromDeliveryHeadline(headline: string | null | undefined): string | null {
  return parseStoreNameFromDeliveryHeadline(headline);
}

/** @deprecated 목록 우측은 `formatDeliveryChatListShortTimestamp` 사용 */
export function formatDeliveryChatListTimestamp(iso: string): { dateLine: string; timeLine: string } {
  const ms = new Date(iso).getTime();
  if (!Number.isFinite(ms)) return { dateLine: "", timeLine: "" };
  const d = new Date(ms);
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  const hh = String(d.getHours()).padStart(2, "0");
  const mm = String(d.getMinutes()).padStart(2, "0");
  return { dateLine: `${y}-${m}-${day}`, timeLine: `${hh}:${mm}` };
}

export function buildDeliveryChatListRowModel(
  room: CommunityMessengerRoomSummary,
  _t: DeliveryChatListTranslate
): DeliveryChatListRowModel | null {
  const identity = resolveStoreOrderDisplayIdentity(room);
  if (!identity && !communityMessengerRoomIsConfirmedDelivery(room)) return null;

  const orderStatusRaw = resolveDeliveryChatListOrderStatusRaw(room);
  const fulfillmentType = resolveDeliveryChatListFulfillmentType(room);
  const statusBadge = deliveryChatListStatusBadgePresentation(orderStatusRaw, fulfillmentType);

  return {
    storeId: identity?.storeId ?? null,
    storeName: identity?.storeName ?? STORE_ORDER_DISPLAY_STORE_FALLBACK,
    orderStatusLabel: statusBadge.label,
    storeThumbnailUrl: identity?.storeProfileImageUrl ?? null,
    statusBadgeClassName: statusBadge.className,
  };
}
