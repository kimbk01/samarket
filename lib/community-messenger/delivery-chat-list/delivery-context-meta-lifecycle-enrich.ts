/**
 * 배달 CM 목록 — `store_orders`·`store_order_events` 원장 lifecycle 을 contextMeta·isReadonly 에 반영.
 */
import { parseStoreOrderIdFromMessengerDirectKey } from "@/lib/community-messenger/delivery-list-canonical-key";
import { resolveCommunityMessengerDeliveryContextMeta } from "@/lib/community-messenger/room-context-meta";
import type { CommunityMessengerRoomContextMetaV1, CommunityMessengerRoomSummary } from "@/lib/community-messenger/types";

export const STORE_ORDER_LIFECYCLE_SELECT = "id, order_status, community_messenger_room_id";

function trim(v: unknown): string {
  return typeof v === "string" ? v.trim() : "";
}

export function mergeStoreOrderLifecycleIntoDeliveryContextMeta(
  meta: CommunityMessengerRoomContextMetaV1,
  args: {
    orderId: string;
    orderStatus: string;
    deliveryCompletedAt?: string | null;
  }
): CommunityMessengerRoomContextMetaV1 {
  const orderStatus = trim(args.orderStatus);
  const completedAt = trim(args.deliveryCompletedAt);
  return {
    ...meta,
    kind: "delivery",
    v: 1,
    storeOrderId: trim(meta.storeOrderId) || args.orderId,
    ...(orderStatus ? { orderStatus } : {}),
    ...(completedAt ? { deliveryCompletedAt: completedAt, completedAt } : {}),
  };
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

  type OrderRow = { id: string; order_status: string; community_messenger_room_id?: string | null };
  const orderById = new Map<string, OrderRow>();
  const orderByRoomId = new Map<string, OrderRow>();

  const ingestOrders = (rows: Array<Record<string, unknown>>) => {
    for (const raw of rows) {
      const id = trim(raw.id);
      const order_status = trim(raw.order_status);
      if (!id) continue;
      const rec: OrderRow = {
        id,
        order_status,
        community_messenger_room_id: trim(raw.community_messenger_room_id) || null,
      };
      orderById.set(id, rec);
      const cmRid = trim(raw.community_messenger_room_id);
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
      ({ v: 1, kind: "delivery", headline: summary.title.trim() || "주문" } as CommunityMessengerRoomContextMetaV1);

    const deliveryCompletedAt = completedAtByOrderId.get(order.id) ?? null;
    summary.contextMeta = mergeStoreOrderLifecycleIntoDeliveryContextMeta(base, {
      orderId: order.id,
      orderStatus: order.order_status,
      deliveryCompletedAt,
    });
    if (order.order_status === "completed") {
      summary.isReadonly = true;
    }
  }
}

function dedupeOrderIds(ids: string[]): string[] {
  return [...new Set(ids.map((id) => id.trim()).filter(Boolean))];
}
