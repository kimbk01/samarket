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
import type { AppLanguageCode } from "@/lib/i18n/config";
import { getRuntimeAppLanguage } from "@/lib/i18n/runtime-app-language";
import { buyerOrderStatusLabel } from "@/lib/stores/buyer-order-status-labels";
import { STORE_ORDER_STATUS_LIST } from "@/lib/stores/store-order-process-model";
import {
  storeOrderChatStatusChipTone,
  type PillarChatStatusChipTone,
} from "@/lib/community-messenger/pillar-chat-list/pillar-chat-list-model";

export type DeliveryChatListTranslate = (key: MessageKey, vars?: Record<string, string | number>) => string;

export type DeliveryChatListRowModel = {
  storeId: string | null;
  storeName: string;
  orderStatusLabel: string | null;
  storeThumbnailUrl: string | null;
  statusBadgeClassName: string;
  /** 주문 상태 원값(`store_orders.order_status`) — 알려진 상태일 때만, 아니면 null */
  orderStatus: string | null;
  /**
   * 1줄 상태 칩 (채팅 시안 4판 「10」) — 이름은 `store-order-process-model` 정본을 **화면 언어(`lang`)** 로.
   * 상태 원값을 모르면(옛 캐시의 서버 번역 글자 등) 칩을 그리지 않는다 — 다른 언어 글자를 그대로 내보이지 않는다.
   */
  statusChip: { label: string; tone: PillarChatStatusChipTone } | null;
};

const KNOWN_STORE_ORDER_STATUSES: ReadonlySet<string> = new Set(STORE_ORDER_STATUS_LIST);

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
  _t: DeliveryChatListTranslate,
  /** 화면 언어 — 목록 행은 `useI18n().language` 를 넘긴다 */
  lang: AppLanguageCode = getRuntimeAppLanguage()
): DeliveryChatListRowModel | null {
  const identity = resolveStoreOrderDisplayIdentity(room);
  if (!identity && !communityMessengerRoomIsConfirmedDelivery(room)) return null;

  const orderStatusRaw = resolveDeliveryChatListOrderStatusRaw(room);
  const fulfillmentType = resolveDeliveryChatListFulfillmentType(room);
  const statusBadge = deliveryChatListStatusBadgePresentation(orderStatusRaw, fulfillmentType, lang);
  const orderStatus = KNOWN_STORE_ORDER_STATUSES.has(orderStatusRaw.trim()) ? orderStatusRaw.trim() : null;
  const statusChip = orderStatus
    ? {
        label: buyerOrderStatusLabel(orderStatus, lang, fulfillmentType),
        tone: storeOrderChatStatusChipTone(orderStatus),
      }
    : null;

  return {
    storeId: identity?.storeId ?? null,
    storeName: identity?.storeName ?? STORE_ORDER_DISPLAY_STORE_FALLBACK,
    orderStatusLabel: statusBadge.label,
    storeThumbnailUrl: identity?.storeProfileImageUrl ?? null,
    statusBadgeClassName: statusBadge.className,
    orderStatus,
    statusChip,
  };
}
