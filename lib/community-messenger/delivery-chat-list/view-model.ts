/**
 * 배달·주문 채팅 전용 목록 행 — `CommunityMessengerRoomSummary` → 매장·주문·상태·시간 표시 필드.
 */
import {
  parseCommunityMessengerRoomContextMeta,
  serializeCommunityMessengerRoomContextMeta,
} from "@/lib/community-messenger/room-context-meta";
import type { CommunityMessengerRoomContextMetaV1, CommunityMessengerRoomSummary } from "@/lib/community-messenger/types";
import type { MessageKey } from "@/lib/i18n/messages";
import {
  resolveDeliveryChatListFulfillmentType,
  resolveDeliveryChatListOrderStatusRaw,
} from "@/lib/community-messenger/delivery-chat-list/delivery-chat-list-resolve";
import { deliveryChatListStatusBadgePresentation } from "@/lib/community-messenger/delivery-chat-list/delivery-chat-list-status-badge";
import { resolveStoreProductMediaUrl } from "@/lib/media/resolve-store-product-media-url";

export type DeliveryChatListTranslate = (key: MessageKey, vars?: Record<string, string | number>) => string;

export type DeliveryChatListRowModel = {
  storeId: string | null;
  storeName: string;
  orderStatusLabel: string | null;
  storeThumbnailUrl: string | null;
  statusBadgeClassName: string;
};

function deliveryListParseSource(room: CommunityMessengerRoomSummary): string {
  const sum = typeof room.summary === "string" ? room.summary.trim() : "";
  const meta = room.contextMeta;
  if (meta?.kind === "delivery") return serializeCommunityMessengerRoomContextMeta(meta);
  return sum;
}

/** `{store} · 주문 {orderNo}` 등 headline 에서 매장명만 추출(레거시 meta 폴백) */
export function parseStoreDisplayNameFromDeliveryHeadline(headline: string | null | undefined): string | null {
  const h = (headline ?? "").trim();
  if (!h) return null;
  const idx = h.indexOf(" · ");
  if (idx > 0) return h.slice(0, idx).trim() || null;
  return h;
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
  const parseSource = deliveryListParseSource(room);
  const parsed = parseCommunityMessengerRoomContextMeta(parseSource);
  const ctx = room.contextMeta?.kind === "delivery" ? room.contextMeta : null;
  const par = parsed?.kind === "delivery" ? parsed : null;
  const meta: CommunityMessengerRoomContextMetaV1 | null = ctx ?? par;
  if (!meta || meta.kind !== "delivery") return null;

  const storeName =
    meta.storeDisplayName?.trim() ||
    parseStoreDisplayNameFromDeliveryHeadline(meta.headline) ||
    "매장";

  const storeId = meta.storeId?.trim() || null;
  const orderStatusRaw = resolveDeliveryChatListOrderStatusRaw(room);
  const fulfillmentType = resolveDeliveryChatListFulfillmentType(room);
  const statusBadge = deliveryChatListStatusBadgePresentation(orderStatusRaw, fulfillmentType);
  const thumb = meta.thumbnailUrl;
  const thumbRaw = typeof thumb === "string" && thumb.trim() ? thumb.trim() : null;
  const storeThumbnailUrl = thumbRaw ? resolveStoreProductMediaUrl(thumbRaw) ?? thumbRaw : null;

  return {
    storeId,
    storeName,
    orderStatusLabel: statusBadge.label,
    storeThumbnailUrl,
    statusBadgeClassName: statusBadge.className,
  };
}
