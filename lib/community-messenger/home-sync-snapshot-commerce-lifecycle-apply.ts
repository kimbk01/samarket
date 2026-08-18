/**
 * CPU-only commerce lifecycle merge from precomputed snapshot payload.
 * Reuses merge helpers — no DB round trips on tier=critical cold path.
 */
import { parseStoreOrderIdFromMessengerDirectKey } from "@/lib/community-messenger/delivery-list-canonical-key";
import {
  indexLatestOrderCompletedAtByOrderId,
  mergeStoreOrderLifecycleIntoDeliveryContextMeta,
  parseStoreOrderLifecycleRow,
} from "@/lib/community-messenger/delivery-chat-list/delivery-context-meta-lifecycle-enrich";
import type { HomeSyncSnapshotPayloadJson } from "@/lib/community-messenger/home-sync-snapshot-assemble";
import { resolveCommunityMessengerDeliveryContextMeta } from "@/lib/community-messenger/room-context-meta";
import {
  mergeProductChatLifecycleIntoTradeContextMeta,
  productChatChatModeIsReadonly,
  type ProductChatLifecycleRow,
} from "@/lib/community-messenger/trade-chat-list/trade-context-meta-lifecycle-enrich";
import type { CommunityMessengerRoomContextMetaV1, CommunityMessengerRoomSummary } from "@/lib/community-messenger/types";
import { parseTradeMessengerDirectKey } from "@/lib/messenger-policy/parse-trade-messenger-direct-key";

function trim(v: unknown): string {
  return typeof v === "string" ? v.trim() : "";
}

function parseProductChatLifecycleRow(raw: Record<string, unknown>): ProductChatLifecycleRow | null {
  const id = trim(raw.id);
  const post_id = trim(raw.post_id);
  const seller_id = trim(raw.seller_id);
  const buyer_id = trim(raw.buyer_id);
  if (!id || !post_id || !seller_id || !buyer_id) return null;
  return {
    id,
    post_id,
    seller_id,
    buyer_id,
    trade_flow_status: trim(raw.trade_flow_status) || null,
    chat_mode: trim(raw.chat_mode) || null,
    seller_completed_at: trim(raw.seller_completed_at) || null,
    buyer_confirmed_at: trim(raw.buyer_confirmed_at) || null,
    community_messenger_room_id: trim(raw.community_messenger_room_id) || null,
  };
}

function resolveProductChatIdForTradeSummary(summary: CommunityMessengerRoomSummary): string | null {
  const fromMeta = trim(summary.contextMeta?.productChatId);
  if (fromMeta) return fromMeta;
  const parsed = parseTradeMessengerDirectKey(summary.messengerDirectKey);
  if (parsed?.kind === "trade_pc") return parsed.productChatId;
  return null;
}

function resolveOrderIdForDeliverySummary(summary: CommunityMessengerRoomSummary): string | null {
  const meta = resolveCommunityMessengerDeliveryContextMeta(summary);
  const fromMeta = trim(meta?.storeOrderId);
  if (fromMeta) return fromMeta;
  return parseStoreOrderIdFromMessengerDirectKey(summary.messengerDirectKey);
}

function indexProductChatRows(rows: Array<Record<string, unknown>>): {
  pcById: Map<string, ProductChatLifecycleRow>;
  pcByRoomId: Map<string, ProductChatLifecycleRow>;
} {
  const pcById = new Map<string, ProductChatLifecycleRow>();
  const pcByRoomId = new Map<string, ProductChatLifecycleRow>();
  for (const raw of rows) {
    const parsed = parseProductChatLifecycleRow(raw);
    if (!parsed) continue;
    pcById.set(parsed.id, parsed);
    const cmRid = trim(parsed.community_messenger_room_id);
    if (cmRid) pcByRoomId.set(cmRid, parsed);
  }
  return { pcById, pcByRoomId };
}

type OrderRow = NonNullable<ReturnType<typeof parseStoreOrderLifecycleRow>>;

function indexStoreOrderRows(rows: Array<Record<string, unknown>>): {
  orderById: Map<string, OrderRow>;
  orderByRoomId: Map<string, OrderRow>;
} {
  const orderById = new Map<string, OrderRow>();
  const orderByRoomId = new Map<string, OrderRow>();
  for (const raw of rows) {
    const rec = parseStoreOrderLifecycleRow(raw);
    if (!rec) continue;
    orderById.set(rec.id, rec);
    const cmRid = trim(rec.community_messenger_room_id);
    if (cmRid) orderByRoomId.set(cmRid, rec);
  }
  return { orderById, orderByRoomId };
}

/** Apply trade + delivery lifecycle from snapshot JSON — sync CPU only. */
export function applyCommerceLifecycleFromSnapshotPayload(
  summaries: CommunityMessengerRoomSummary[],
  payload: HomeSyncSnapshotPayloadJson
): void {
  const block = payload.commerce_lifecycle;
  if (!block || !summaries.length) return;

  const pcRows = Array.isArray(block.product_chats)
    ? (block.product_chats as Array<Record<string, unknown>>)
    : [];
  const orderRows = Array.isArray(block.store_orders)
    ? (block.store_orders as Array<Record<string, unknown>>)
    : [];
  const eventRows = Array.isArray(block.order_completed_events)
    ? (block.order_completed_events as Array<Record<string, unknown>>)
    : [];

  if (pcRows.length) {
    const { pcById, pcByRoomId } = indexProductChatRows(pcRows);
    const tradeTargets = summaries.filter(
      (s) =>
        s.roomType === "direct" &&
        (s.contextMeta?.kind === "trade" || parseTradeMessengerDirectKey(s.messengerDirectKey) != null)
    );
    for (const summary of tradeTargets) {
      const rid = trim(summary.id);
      if (!rid) continue;
      const pcid = resolveProductChatIdForTradeSummary(summary);
      const row = (pcid ? pcById.get(pcid) : undefined) ?? pcByRoomId.get(rid);
      if (!row) continue;
      const base: CommunityMessengerRoomContextMetaV1 =
        summary.contextMeta?.kind === "trade"
          ? summary.contextMeta
          : { v: 1, kind: "trade", headline: summary.title.trim() || "거래" };
      summary.contextMeta = mergeProductChatLifecycleIntoTradeContextMeta(base, row);
      if (productChatChatModeIsReadonly(row.chat_mode)) {
        summary.isReadonly = true;
      }
    }
  }

  if (orderRows.length) {
    const { orderById, orderByRoomId } = indexStoreOrderRows(orderRows);
    const completedAtByOrderId = indexLatestOrderCompletedAtByOrderId(eventRows);
    const deliveryTargets = summaries.filter((s) => resolveCommunityMessengerDeliveryContextMeta(s) != null);
    for (const summary of deliveryTargets) {
      const rid = trim(summary.id);
      if (!rid) continue;
      const oid = resolveOrderIdForDeliverySummary(summary);
      const order = (oid ? orderById.get(oid) : undefined) ?? orderByRoomId.get(rid);
      if (!order) continue;
      const base =
        resolveCommunityMessengerDeliveryContextMeta(summary) ??
        ({ v: 1, kind: "delivery" } as CommunityMessengerRoomContextMetaV1);
      const deliveryCompletedAt = completedAtByOrderId.get(order.id) ?? null;
      summary.contextMeta = mergeStoreOrderLifecycleIntoDeliveryContextMeta(base, {
        orderId: order.id,
        orderStatus: order.order_status,
        deliveryCompletedAt,
        storeId: order.storeId,
        storeDisplayName: order.storeName,
        storeProfileImageUrl: order.storeProfileImageUrl,
      });
      if (order.order_status === "completed") {
        summary.isReadonly = true;
      }
    }
  }
}
