import type { SupabaseClient } from "@supabase/supabase-js";
import { serializeCommunityMessengerRoomContextMeta } from "@/lib/community-messenger/room-context-meta";
import type { CommunityMessengerRoomContextMetaV1 } from "@/lib/community-messenger/types";
import { systemChatLineForOrderStatus, type OrderChatFlow } from "@/lib/shared-order-chat/chat-message-builder";
import type { SharedOrderStatus } from "@/lib/shared-orders/types";
import { storeOrderStatusToShared } from "@/lib/store-commerce/map-order-status";

function trimText(value: unknown): string {
  return typeof value === "string" ? value.trim() : "";
}

function nowIso(): string {
  return new Date().toISOString();
}

function flowFromFulfillment(value: unknown): OrderChatFlow {
  return trimText(value).toLowerCase() === "local_delivery" ? "delivery" : "pickup";
}

function moneyLabel(value: unknown): string | undefined {
  const n = Number(value ?? 0);
  if (!Number.isFinite(n) || n <= 0) return undefined;
  return `₱${n.toLocaleString("en-US")}`;
}

function isUniqueViolationError(error: unknown): boolean {
  return (error as { code?: string } | null)?.code === "23505";
}

type StoreOrderMessengerOrderRow = {
  id?: unknown;
  order_no?: unknown;
  store_id?: unknown;
  buyer_user_id?: unknown;
  order_status?: unknown;
  fulfillment_type?: unknown;
  payment_amount?: unknown;
  total_amount?: unknown;
  community_messenger_room_id?: unknown;
  stores?: { store_name?: unknown; owner_user_id?: unknown } | Array<{ store_name?: unknown; owner_user_id?: unknown }> | null;
};

export type StoreOrderMessengerEnsureResult =
  | {
      ok: true;
      roomId: string;
      buyerUserId: string;
      ownerUserId: string;
      orderStatus: SharedOrderStatus;
      orderFlow: OrderChatFlow;
      storeName: string;
      orderNo: string;
    }
  | { ok: false; error: string; status?: number };

function storeRowFromOrder(row: StoreOrderMessengerOrderRow) {
  return Array.isArray(row.stores) ? row.stores[0] : row.stores;
}

function contextMetaFromOrder(row: StoreOrderMessengerOrderRow): CommunityMessengerRoomContextMetaV1 {
  const store = storeRowFromOrder(row);
  const storeName = trimText(store?.store_name) || "매장";
  const orderId = trimText(row.id);
  const orderNo = trimText(row.order_no);
  const fulfillmentType = trimText(row.fulfillment_type);
  const orderStatus = trimText(row.order_status);
  const meta: CommunityMessengerRoomContextMetaV1 = {
    v: 1,
    kind: "delivery",
    headline: orderNo ? `${storeName} · 주문 ${orderNo}` : `${storeName} · 주문`,
    storeOrderId: orderId,
    storeId: trimText(row.store_id),
    orderNo,
    fulfillmentType,
  };
  const priceLabel = moneyLabel(row.payment_amount ?? row.total_amount);
  if (priceLabel) meta.priceLabel = priceLabel;
  if (orderStatus) meta.stepLabel = orderStatus;
  return meta;
}

export async function ensureStoreOrderMessengerRoom(
  sb: SupabaseClient<any>,
  input: { orderId: string; userId?: string | null }
): Promise<StoreOrderMessengerEnsureResult> {
  const orderId = input.orderId.trim();
  if (!orderId) return { ok: false, error: "missing_order_id", status: 400 };
  const { data, error } = await sb
    .from("store_orders")
    .select(
      "id, order_no, store_id, buyer_user_id, order_status, fulfillment_type, payment_amount, total_amount, community_messenger_room_id, stores(store_name, owner_user_id)"
    )
    .eq("id", orderId)
    .maybeSingle();
  if (error) return { ok: false, error: error.message, status: 500 };
  if (!data) return { ok: false, error: "order_not_found", status: 404 };

  const row = data as StoreOrderMessengerOrderRow;
  const store = storeRowFromOrder(row);
  const buyerUserId = trimText(row.buyer_user_id);
  const ownerUserId = trimText(store?.owner_user_id);
  if (!buyerUserId || !ownerUserId) return { ok: false, error: "participants_missing", status: 500 };
  const viewer = trimText(input.userId);
  if (viewer && viewer !== buyerUserId && viewer !== ownerUserId) {
    return { ok: false, error: "forbidden", status: 403 };
  }

  const existingLinked = trimText(row.community_messenger_room_id);
  const directKeys = [`store_order:${orderId}`, `trade_order:${orderId}`];
  let roomId = existingLinked;
  if (!roomId) {
    const { data: existingRoom } = await sb
      .from("community_messenger_rooms")
      .select("id")
      .eq("room_type", "direct")
      .in("direct_key", directKeys)
      .order("created_at", { ascending: true })
      .limit(1)
      .maybeSingle();
    roomId = trimText((existingRoom as { id?: unknown } | null)?.id);
  }

  const createdAt = nowIso();
  const meta = contextMetaFromOrder(row);
  if (!roomId) {
    const { data: inserted, error: insertErr } = await sb
      .from("community_messenger_rooms")
      .insert({
        room_type: "direct",
        room_status: "active",
        is_readonly: false,
        created_by: viewer || buyerUserId,
        direct_key: directKeys[0],
        title: "",
        summary: serializeCommunityMessengerRoomContextMeta(meta),
        last_message: "",
        last_message_type: "system",
        last_message_at: createdAt,
      })
      .select("id")
      .single();
    if (insertErr) {
      if (!isUniqueViolationError(insertErr)) return { ok: false, error: insertErr.message, status: 500 };
      const { data: raced } = await sb
        .from("community_messenger_rooms")
        .select("id")
        .eq("room_type", "direct")
        .in("direct_key", directKeys)
        .order("created_at", { ascending: true })
        .limit(1)
        .maybeSingle();
      roomId = trimText((raced as { id?: unknown } | null)?.id);
    } else {
      roomId = trimText((inserted as { id?: unknown } | null)?.id);
    }
  } else {
    await sb
      .from("community_messenger_rooms")
      .update({ summary: serializeCommunityMessengerRoomContextMeta(meta), updated_at: createdAt })
      .eq("id", roomId);
  }
  if (!roomId) return { ok: false, error: "room_create_failed", status: 500 };

  const participants = [
    { room_id: roomId, user_id: buyerUserId, role: "member" },
    { room_id: roomId, user_id: ownerUserId, role: "owner" },
  ];
  const partResults = await Promise.all(
    participants.map((participant) =>
      sb.from("community_messenger_participants").upsert(participant, {
        onConflict: "room_id,user_id",
        ignoreDuplicates: false,
      })
    )
  );
  for (const { error: partErr } of partResults) {
    if (partErr) return { ok: false, error: partErr.message, status: 500 };
  }
  await sb.from("store_orders").update({ community_messenger_room_id: roomId }).eq("id", orderId);

  return {
    ok: true,
    roomId,
    buyerUserId,
    ownerUserId,
    orderStatus: storeOrderStatusToShared(trimText(row.order_status)) ?? "pending",
    orderFlow: flowFromFulfillment(row.fulfillment_type),
    storeName: trimText(store?.store_name) || "매장",
    orderNo: trimText(row.order_no),
  };
}

async function appendStoreOrderMessengerSystemMessage(
  sb: SupabaseClient<any>,
  input: { orderId: string; actorUserId?: string | null; content: string; relatedOrderStatus?: SharedOrderStatus | null },
  ensuredRoom?: Extract<StoreOrderMessengerEnsureResult, { ok: true }>
): Promise<void> {
  const ensured =
    ensuredRoom ??
    (await ensureStoreOrderMessengerRoom(sb, { orderId: input.orderId, userId: input.actorUserId ?? null }));
  if (!ensured.ok) return;
  const content = input.content.trim();
  if (!content) return;
  const createdAt = nowIso();
  const { data: inserted, error } = await sb
    .from("community_messenger_messages")
    .insert({
      room_id: ensured.roomId,
      sender_id: null,
      message_type: "system",
      content,
      metadata: {
        domain: "store_order",
        storeOrderId: input.orderId,
        ...(input.relatedOrderStatus ? { orderStatus: input.relatedOrderStatus } : {}),
      },
      created_at: createdAt,
    })
    .select("id")
    .single();
  if (error) return;
  await sb
    .from("community_messenger_rooms")
    .update({ last_message: content, last_message_type: "system", last_message_at: createdAt, updated_at: createdAt })
    .eq("id", ensured.roomId);
  // System lines use the actor only to decide who should not receive unread.
  // Order-created/payment lines are buyer-originated, while status lines pass owner explicitly.
  const actor = trimText(input.actorUserId) || ensured.buyerUserId;
  await sb.rpc("community_messenger_apply_unread_for_text_message", {
    p_room_id: ensured.roomId,
    p_sender_id: actor,
    p_read_at: createdAt,
  });
  const messageId = trimText((inserted as { id?: unknown } | null)?.id);
  if (messageId) {
    await sb
      .from("community_messenger_participants")
      .update({ last_read_message_id: messageId, last_read_at: createdAt, unread_count: 0 })
      .eq("room_id", ensured.roomId)
      .eq("user_id", actor);
  }
}

export async function appendStoreOrderMessengerPaymentCompletedLine(
  sb: SupabaseClient<any>,
  orderId: string
): Promise<void> {
  await appendStoreOrderMessengerSystemMessage(sb, {
    orderId,
    content: "주문이 등록되었어요. 매장에서 확인한 뒤 접수·준비가 진행되면 여기서도 안내가 올라와요.",
  });
}

export async function appendStoreOrderMessengerStatusTransition(
  sb: SupabaseClient<any>,
  orderId: string,
  previousDbStatus: string,
  nextDbStatus: string
): Promise<void> {
  const next = storeOrderStatusToShared(nextDbStatus);
  if (!next) return;
  const ensured = await ensureStoreOrderMessengerRoom(sb, { orderId });
  if (!ensured.ok) return;
  if (next === "completed" && storeOrderStatusToShared(previousDbStatus) === "delivering" && ensured.orderFlow === "delivery") {
    await appendStoreOrderMessengerSystemMessage(
      sb,
      {
        orderId,
        actorUserId: ensured.ownerUserId,
        content: systemChatLineForOrderStatus("arrived", "delivery") ?? "",
        relatedOrderStatus: "arrived",
      },
      ensured
    );
  }
  const line = systemChatLineForOrderStatus(next, ensured.orderFlow);
  if (!line) return;
  await appendStoreOrderMessengerSystemMessage(
    sb,
    {
      orderId,
      actorUserId: ensured.ownerUserId,
      content: line,
      relatedOrderStatus: next,
    },
    ensured
  );
}

export async function getBuyerStoreOrderMessengerUnreadMap(
  sb: SupabaseClient<any>,
  buyerUserId: string,
  orderIds: string[]
): Promise<Record<string, number>> {
  const uid = buyerUserId.trim();
  const ids = orderIds.map((id) => id.trim()).filter(Boolean);
  if (!uid || !ids.length) return {};
  const { data: orders } = await sb
    .from("store_orders")
    .select("id, community_messenger_room_id")
    .eq("buyer_user_id", uid)
    .in("id", ids);
  const roomToOrder = new Map<string, string>();
  for (const row of (orders ?? []) as Array<{ id?: unknown; community_messenger_room_id?: unknown }>) {
    const oid = trimText(row.id);
    const rid = trimText(row.community_messenger_room_id);
    if (oid && rid) roomToOrder.set(rid, oid);
  }
  if (!roomToOrder.size) return {};
  const { data: parts } = await sb
    .from("community_messenger_participants")
    .select("room_id, unread_count")
    .eq("user_id", uid)
    .in("room_id", [...roomToOrder.keys()]);
  const out: Record<string, number> = {};
  for (const p of (parts ?? []) as Array<{ room_id?: unknown; unread_count?: unknown }>) {
    const oid = roomToOrder.get(trimText(p.room_id));
    if (oid) out[oid] = Math.max(0, Math.floor(Number(p.unread_count ?? 0) || 0));
  }
  return out;
}

export async function sumBuyerStoreOrderMessengerUnread(
  sb: SupabaseClient<any>,
  buyerUserId: string,
  hiddenOrderIds: Set<string> = new Set()
): Promise<number> {
  const uid = buyerUserId.trim();
  if (!uid) return 0;
  let q = sb
    .from("store_orders")
    .select("id, community_messenger_room_id")
    .eq("buyer_user_id", uid)
    .not("community_messenger_room_id", "is", null);
  const hidden = [...hiddenOrderIds].map((id) => id.trim()).filter(Boolean);
  if (hidden.length) q = q.not("id", "in", `(${hidden.join(",")})`);
  const { data: orders } = await q;
  const roomIds = ((orders ?? []) as Array<{ community_messenger_room_id?: unknown }>)
    .map((row) => trimText(row.community_messenger_room_id))
    .filter(Boolean);
  if (!roomIds.length) return 0;
  const { data: parts } = await sb
    .from("community_messenger_participants")
    .select("unread_count")
    .eq("user_id", uid)
    .in("room_id", roomIds);
  return (parts ?? []).reduce((sum, row) => sum + Math.max(0, Math.floor(Number(row.unread_count ?? 0) || 0)), 0);
}

/** 사장님 매장 주문 채팅 미읽음 — `communityMessengerUnread` 와 별도 필드로만 노출(합산 total 에는 중복 포함하지 않음). */
export async function countOwnerStoreOrderMessengerUnread(
  sb: SupabaseClient<any>,
  ownerUserId: string
): Promise<number> {
  const uid = ownerUserId.trim();
  if (!uid) return 0;
  const { data: stores } = await sb.from("stores").select("id").eq("owner_user_id", uid);
  const storeIds = ((stores ?? []) as Array<{ id?: unknown }>).map((row) => trimText(row.id)).filter(Boolean);
  if (!storeIds.length) return 0;
  const { data: orders } = await sb
    .from("store_orders")
    .select("community_messenger_room_id")
    .in("store_id", storeIds)
    .not("community_messenger_room_id", "is", null);
  const roomIds = ((orders ?? []) as Array<{ community_messenger_room_id?: unknown }>)
    .map((row) => trimText(row.community_messenger_room_id))
    .filter(Boolean);
  if (!roomIds.length) return 0;
  const { data: parts } = await sb
    .from("community_messenger_participants")
    .select("unread_count")
    .eq("user_id", uid)
    .in("room_id", roomIds);
  return (parts ?? []).reduce((sum, row) => sum + Math.max(0, Math.floor(Number(row.unread_count ?? 0) || 0)), 0);
}

