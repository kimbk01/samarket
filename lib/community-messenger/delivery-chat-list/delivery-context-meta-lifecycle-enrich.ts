/**
 * 배달 CM 목록 — `store_orders`·`store_order_events` 원장 lifecycle 을 contextMeta·isReadonly 에 반영.
 */
import { parseStoreOrderIdFromMessengerDirectKey } from "@/lib/community-messenger/delivery-list-canonical-key";
import { resolveCommunityMessengerDeliveryContextMeta } from "@/lib/community-messenger/room-context-meta";
import {
  isUnusableStoreOrderDisplayName,
} from "@/lib/community-messenger/store-order-display-identity";
import type { CommunityMessengerRoomContextMetaV1, CommunityMessengerRoomSummary } from "@/lib/community-messenger/types";

export const STORE_ORDER_LIFECYCLE_SELECT =
  "id, order_status, community_messenger_room_id, store_id, stores(store_name, profile_image_url)";

function trim(v: unknown): string {
  return typeof v === "string" ? v.trim() : "";
}

function usableStoreName(v: unknown): string {
  const n = trim(v);
  return isUnusableStoreOrderDisplayName(n) ? "" : n;
}

function storeEmbedFromOrderRow(raw: Record<string, unknown>): {
  store_name?: unknown;
  profile_image_url?: unknown;
} | null {
  const stores = raw.stores;
  if (Array.isArray(stores)) {
    const first = stores[0];
    return first && typeof first === "object" ? (first as { store_name?: unknown; profile_image_url?: unknown }) : null;
  }
  if (stores && typeof stores === "object") {
    return stores as { store_name?: unknown; profile_image_url?: unknown };
  }
  return null;
}

export type StoreOrderLifecycleRow = {
  id: string;
  order_status: string;
  community_messenger_room_id?: string | null;
  storeId?: string | null;
  storeName?: string | null;
  storeProfileImageUrl?: string | null;
};

export function parseStoreOrderLifecycleRow(raw: Record<string, unknown>): StoreOrderLifecycleRow | null {
  const id = trim(raw.id);
  const order_status = trim(raw.order_status);
  if (!id) return null;
  const embed = storeEmbedFromOrderRow(raw);
  return {
    id,
    order_status,
    community_messenger_room_id: trim(raw.community_messenger_room_id) || null,
    storeId: trim(raw.store_id) || null,
    storeName: usableStoreName(embed?.store_name) || usableStoreName(raw.store_name) || null,
    storeProfileImageUrl:
      trim(embed?.profile_image_url) || trim(raw.profile_image_url) || trim(raw.store_profile_image_url) || null,
  };
}

export function mergeStoreOrderLifecycleIntoDeliveryContextMeta(
  meta: CommunityMessengerRoomContextMetaV1,
  args: {
    orderId: string;
    orderStatus: string;
    deliveryCompletedAt?: string | null;
    storeId?: string | null;
    storeDisplayName?: string | null;
    storeProfileImageUrl?: string | null;
  }
): CommunityMessengerRoomContextMetaV1 {
  const orderStatus = trim(args.orderStatus);
  const completedAt = trim(args.deliveryCompletedAt);
  const storeId = trim(args.storeId) || trim(meta.storeId);
  const storeDisplayName = usableStoreName(args.storeDisplayName) || usableStoreName(meta.storeDisplayName);
  const storeProfileImageUrl =
    trim(args.storeProfileImageUrl) || trim(meta.storeProfileImageUrl) || trim(meta.thumbnailUrl);
  const headline = usableStoreName(meta.headline) || storeDisplayName || "";
  const next: CommunityMessengerRoomContextMetaV1 = {
    ...meta,
    kind: "delivery",
    v: 1,
    storeOrderId: trim(meta.storeOrderId) || args.orderId,
  };
  if (orderStatus) next.orderStatus = orderStatus;
  if (completedAt) {
    next.deliveryCompletedAt = completedAt;
    next.completedAt = completedAt;
  }
  if (storeId) next.storeId = storeId;
  if (storeDisplayName) next.storeDisplayName = storeDisplayName;
  if (storeProfileImageUrl) {
    next.storeProfileImageUrl = storeProfileImageUrl;
    if (!next.thumbnailUrl) next.thumbnailUrl = storeProfileImageUrl;
  }
  if (headline) next.headline = headline;
  else if (isUnusableStoreOrderDisplayName(next.headline)) delete next.headline;
  return next;
}

function resolveOrderIdForDeliverySummary(summary: CommunityMessengerRoomSummary): string | null {
  const meta = resolveCommunityMessengerDeliveryContextMeta(summary);
  const fromMeta = trim(meta?.storeOrderId);
  if (fromMeta) return fromMeta;
  return parseStoreOrderIdFromMessengerDirectKey(summary.messengerDirectKey);
}

/** order_id → 최신 `order_completed` 이벤트 created_at */
export function indexLatestOrderCompletedAtByOrderId(
  rows: Array<{ order_id?: unknown; created_at?: unknown; event_type?: unknown }>
): Map<string, string> {
  const out = new Map<string, string>();
  for (const row of rows) {
    if (trim(row.event_type) !== "order_completed") continue;
    const oid = trim(row.order_id);
    const at = trim(row.created_at);
    if (!oid || !at) continue;
    const prev = out.get(oid);
    if (!prev || Date.parse(at) > Date.parse(prev)) out.set(oid, at);
  }
  return out;
}

/** 배달 방 요약에 store_orders lifecycle 필드를 병합한다. */
export async function enrichDeliveryRoomLifecycleFieldsFromStoreOrders(
  sb: { from: (table: string) => { select: (cols: string) => unknown } },
  summaries: CommunityMessengerRoomSummary[]
): Promise<void> {
  const deliveryTargets = summaries.filter((s) => resolveCommunityMessengerDeliveryContextMeta(s) != null);
  if (!deliveryTargets.length) return;

  const orderIdByRoomId = new Map<string, string>();
  const orderIds = new Set<string>();
  const roomIdsWithoutOrder: string[] = [];

  for (const s of deliveryTargets) {
    const rid = trim(s.id);
    if (!rid) continue;
    const oid = resolveOrderIdForDeliverySummary(s);
    if (oid) {
      orderIds.add(oid);
      orderIdByRoomId.set(rid, oid);
    } else {
      roomIdsWithoutOrder.push(rid);
    }
  }

  const orderById = new Map<string, StoreOrderLifecycleRow>();
  const orderByRoomId = new Map<string, StoreOrderLifecycleRow>();

  const ingestOrders = (rows: Array<Record<string, unknown>>) => {
    for (const raw of rows) {
      const rec = parseStoreOrderLifecycleRow(raw);
      if (!rec) continue;
      orderById.set(rec.id, rec);
      const cmRid = trim(rec.community_messenger_room_id);
      if (cmRid) orderByRoomId.set(cmRid, rec);
    }
  };

  const oidList = [...orderIds];
  if (oidList.length) {
    const q = sb.from("store_orders").select(STORE_ORDER_LIFECYCLE_SELECT) as {
      in: (col: string, vals: string[]) => Promise<{ data?: unknown }>;
    };
    const { data } = await q.in("id", oidList);
    ingestOrders((Array.isArray(data) ? data : []) as Array<Record<string, unknown>>);
  }

  const roomLookupIds = roomIdsWithoutOrder.filter((rid) => !orderByRoomId.has(rid));
  if (roomLookupIds.length) {
    const q = sb.from("store_orders").select(STORE_ORDER_LIFECYCLE_SELECT) as {
      in: (col: string, vals: string[]) => Promise<{ data?: unknown }>;
    };
    const { data } = await q.in("community_messenger_room_id", roomLookupIds);
    ingestOrders((Array.isArray(data) ? data : []) as Array<Record<string, unknown>>);
  }

  const allOrderIds = dedupeOrderIds([...orderById.keys()]);
  let completedAtByOrderId = new Map<string, string>();
  if (allOrderIds.length) {
    const q = sb.from("store_order_events").select("order_id, created_at, event_type") as {
      in: (col: string, vals: string[]) => { eq: (col: string, val: string) => Promise<{ data?: unknown }> };
    };
    const { data } = await q.in("order_id", allOrderIds).eq("event_type", "order_completed");
    completedAtByOrderId = indexLatestOrderCompletedAtByOrderId(
      (Array.isArray(data) ? data : []) as Array<Record<string, unknown>>
    );
  }

  for (const summary of deliveryTargets) {
    const rid = trim(summary.id);
    if (!rid) continue;
    const oid = orderIdByRoomId.get(rid) ?? orderByRoomId.get(rid)?.id;
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

function dedupeOrderIds(ids: string[]): string[] {
  return [...new Set(ids.map((id) => id.trim()).filter(Boolean))];
}
