import {
  parseCommunityMessengerRoomContextMeta,
  serializeCommunityMessengerRoomContextMeta,
} from "@/lib/community-messenger/room-context-meta";
import type { CommunityMessengerRoomSummary } from "@/lib/community-messenger/types";

function deliveryListParseSource(room: CommunityMessengerRoomSummary): string {
  const sum = typeof room.summary === "string" ? room.summary.trim() : "";
  const meta = room.contextMeta;
  if (meta?.kind === "delivery") return serializeCommunityMessengerRoomContextMeta(meta);
  return sum;
}

/** `store_orders.order_status` 우선 — 없으면 `stepLabel` slug */
export function resolveDeliveryChatListOrderStatusRaw(room: CommunityMessengerRoomSummary): string {
  const ctx = room.contextMeta?.kind === "delivery" ? room.contextMeta : null;
  const parsed = parseCommunityMessengerRoomContextMeta(deliveryListParseSource(room));
  const par = parsed?.kind === "delivery" ? parsed : null;
  const meta = ctx ?? par;
  if (!meta || meta.kind !== "delivery") return "";
  return meta.orderStatus?.trim() || meta.stepLabel?.trim() || "";
}

export function resolveDeliveryChatListFulfillmentType(room: CommunityMessengerRoomSummary): string {
  const ctx = room.contextMeta?.kind === "delivery" ? room.contextMeta : null;
  const parsed = parseCommunityMessengerRoomContextMeta(deliveryListParseSource(room));
  const par = parsed?.kind === "delivery" ? parsed : null;
  const meta = ctx ?? par;
  if (!meta || meta.kind !== "delivery") return "local_delivery";
  return meta.fulfillmentType?.trim() || "local_delivery";
}
