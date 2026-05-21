/**
 * 배달·주문 채팅 전용 목록 행 — `CommunityMessengerRoomSummary` → 매장·주문·상태·시간 표시 필드.
 */
import {
  parseCommunityMessengerRoomContextMeta,
  serializeCommunityMessengerRoomContextMeta,
} from "@/lib/community-messenger/room-context-meta";
import { buyerOrderStatusLabel } from "@/lib/stores/buyer-order-status-labels";
import type { CommunityMessengerRoomContextMetaV1, CommunityMessengerRoomSummary } from "@/lib/community-messenger/types";

export type DeliveryChatListRowModel = {
  storeId: string | null;
  storeName: string;
  orderNo: string | null;
  orderStatusLabel: string | null;
  storeThumbnailUrl: string | null;
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

function resolveOrderStatusLabel(stepLabel: string | null | undefined): string | null {
  const raw = (stepLabel ?? "").trim();
  if (!raw) return null;
  const localized = buyerOrderStatusLabel(raw);
  return localized.trim() || raw;
}

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

export function buildDeliveryChatListRowModel(room: CommunityMessengerRoomSummary): DeliveryChatListRowModel | null {
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
  const orderNo = meta.orderNo?.trim() || null;
  const orderStatusLabel = resolveOrderStatusLabel(meta.stepLabel);
  const thumb = meta.thumbnailUrl;
  const storeThumbnailUrl = typeof thumb === "string" && thumb.trim() ? thumb.trim() : null;

  return {
    storeId,
    storeName,
    orderNo,
    orderStatusLabel,
    storeThumbnailUrl,
  };
}
