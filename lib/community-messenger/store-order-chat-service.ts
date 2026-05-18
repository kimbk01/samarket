import type { SupabaseClient } from "@supabase/supabase-js";
import { serializeCommunityMessengerRoomContextMeta } from "@/lib/community-messenger/room-context-meta";
import type { CommunityMessengerRoomContextMetaV1 } from "@/lib/community-messenger/types";
import {
  buildMessengerContextInputFromStoreOrderSnapshot,
  buildMessengerContextMetaFromStoreOrder,
} from "@/lib/community-messenger/store-order-messenger-context";
import { systemChatLineForOrderStatus, type OrderChatFlow } from "@/lib/shared-order-chat/chat-message-builder";
import type { SharedOrderStatus } from "@/lib/shared-orders/types";
import { storeOrderStatusToShared } from "@/lib/store-commerce/map-order-status";
import { isStoreOrderSummarySystemContent } from "@/lib/store-order-chat/collapse-duplicate-order-summaries";
import {
  formatStoreOrderSummaryForChatMessage,
  type ChatSummaryItemFields,
  type ChatSummaryOrderFields,
} from "@/lib/stores/format-store-order-chat-summary";
import { buildStoreOrderSummaryTimelineSteps } from "@/lib/store-order-chat/store-order-summary-timeline";
import { BUYER_ORDER_STATUS_LABEL } from "@/lib/stores/store-order-process-criteria";

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
  const paymentRaw = Number(row.payment_amount ?? row.total_amount ?? 0);
  const paymentAmount = Number.isFinite(paymentRaw) ? paymentRaw : 0;
  return buildMessengerContextMetaFromStoreOrder(
    buildMessengerContextInputFromStoreOrderSnapshot({
      orderId,
      storeName,
      orderNo,
      storeId: trimText(row.store_id),
      fulfillmentType,
      orderStatus,
      paymentAmount,
    })
  );
}

type StoreOrderSummaryRow = StoreOrderMessengerOrderRow & {
  created_at?: unknown;
  delivery_address_summary?: unknown;
  delivery_address_detail?: unknown;
  buyer_phone?: unknown;
  buyer_note?: unknown;
  delivery_fee_amount?: unknown;
  discount_amount?: unknown;
  buyer_payment_method?: unknown;
  buyer_payment_method_detail?: unknown;
  accepted_at?: unknown;
  estimated_prep_minutes?: unknown;
  estimated_ready_at?: unknown;
};

async function loadStoreOrderSummaryFields(
  sb: SupabaseClient<any>,
  orderId: string
): Promise<{ order: ChatSummaryOrderFields; items: ChatSummaryItemFields[] } | null> {
  const { data, error } = await sb
    .from("store_orders")
    .select(
      "id, order_no, order_status, fulfillment_type, payment_amount, total_amount, discount_amount, created_at, accepted_at, estimated_prep_minutes, estimated_ready_at, delivery_address_summary, delivery_address_detail, buyer_phone, buyer_note, delivery_fee_amount, buyer_payment_method, buyer_payment_method_detail, stores(store_name)"
    )
    .eq("id", orderId)
    .maybeSingle();
  if (error || !data) return null;
  const row = data as StoreOrderSummaryRow;
  const store = storeRowFromOrder(row);
  const status = trimText(row.order_status);
  const order: ChatSummaryOrderFields = {
    store_name: trimText(store?.store_name) || "매장",
    order_no: trimText(row.order_no),
    order_status: BUYER_ORDER_STATUS_LABEL[status] ?? status,
    fulfillment_type: trimText(row.fulfillment_type),
    delivery_address_summary:
      typeof row.delivery_address_summary === "string" ? row.delivery_address_summary : null,
    delivery_address_detail:
      typeof row.delivery_address_detail === "string" ? row.delivery_address_detail : null,
    buyer_phone: typeof row.buyer_phone === "string" ? row.buyer_phone : null,
    buyer_note: typeof row.buyer_note === "string" ? row.buyer_note : null,
    payment_amount: Number(row.payment_amount ?? row.total_amount ?? 0) || 0,
    discount_amount:
      row.discount_amount != null ? Number(row.discount_amount) : null,
    delivery_fee_amount:
      row.delivery_fee_amount != null ? Number(row.delivery_fee_amount) : null,
    buyer_payment_method:
      typeof row.buyer_payment_method === "string" ? row.buyer_payment_method : null,
    buyer_payment_method_detail:
      typeof row.buyer_payment_method_detail === "string" ? row.buyer_payment_method_detail : null,
    created_at: typeof row.created_at === "string" ? row.created_at : null,
    accepted_at: typeof row.accepted_at === "string" ? row.accepted_at : null,
    estimated_prep_minutes:
      row.estimated_prep_minutes != null ? Number(row.estimated_prep_minutes) : null,
    estimated_ready_at:
      typeof row.estimated_ready_at === "string" ? row.estimated_ready_at : null,
  };
  const { data: itemRows } = await sb
    .from("store_order_items")
    .select("product_title_snapshot, price_snapshot, qty, subtotal, options_snapshot_json")
    .eq("order_id", orderId);
  const items = ((itemRows ?? []) as ChatSummaryItemFields[]).map((it) => ({
    product_title_snapshot: trimText(it.product_title_snapshot) || "상품",
    price_snapshot: Number(it.price_snapshot) || 0,
    qty: Math.max(1, Math.floor(Number(it.qty) || 1)),
    subtotal: Number((it as { subtotal?: unknown }).subtotal ?? 0) || undefined,
    options_snapshot_json: it.options_snapshot_json,
  }));
  return { order, items };
}

/** 상태·결제 변경 후 방 `summary` 의 stepLabel·headline 을 주문 스냅샷과 맞춘다. */
export async function syncStoreOrderMessengerRoomContextMeta(
  sb: SupabaseClient<any>,
  orderId: string
): Promise<void> {
  const oid = orderId.trim();
  if (!oid) return;
  const { data: orderRow, error } = await sb
    .from("store_orders")
    .select(
      "id, order_no, store_id, order_status, fulfillment_type, payment_amount, total_amount, community_messenger_room_id, stores(store_name)"
    )
    .eq("id", oid)
    .maybeSingle();
  if (error || !orderRow) return;
  const roomId = trimText((orderRow as StoreOrderMessengerOrderRow).community_messenger_room_id);
  if (!roomId) return;
  const meta = contextMetaFromOrder(orderRow as StoreOrderMessengerOrderRow);
  const payload = serializeCommunityMessengerRoomContextMeta(meta);
  await sb
    .from("community_messenger_rooms")
    .update({ summary: payload, updated_at: nowIso() })
    .eq("id", roomId);
}

async function loadStoreOrderSummaryMessageState(
  sb: SupabaseClient<any>,
  roomId: string,
  orderId: string
): Promise<{ metadataSummaryId: string; legacySystemSummaryId: string }> {
  const { data: byMeta, error: metaErr } = await sb
    .from("community_messenger_messages")
    .select("id")
    .eq("room_id", roomId)
    .eq("message_type", "system")
    .filter("metadata->>kind", "eq", "store_order_summary")
    .filter("metadata->>storeOrderId", "eq", orderId)
    .limit(1)
    .maybeSingle();
  const metadataSummaryId = !metaErr ? trimText((byMeta as { id?: unknown } | null)?.id) : "";
  if (metadataSummaryId) return { metadataSummaryId, legacySystemSummaryId: "" };

  const { data: rows } = await sb
    .from("community_messenger_messages")
    .select("id, content")
    .eq("room_id", roomId)
    .eq("message_type", "system")
    .order("created_at", { ascending: true })
    .limit(40);
  for (const row of (rows ?? []) as Array<{ content?: unknown }>) {
    if (isStoreOrderSummarySystemContent(String(row.content ?? ""))) {
      return {
        metadataSummaryId,
        legacySystemSummaryId: trimText((row as { id?: unknown }).id),
      };
    }
  }
  return { metadataSummaryId, legacySystemSummaryId: "" };
}

async function loadStoreOrderStatusEvents(
  sb: SupabaseClient<any>,
  orderId: string
): Promise<Array<{ to_status?: string | null; created_at?: string | null }>> {
  const { data, error } = await sb
    .from("store_order_events")
    .select("to_status, created_at")
    .eq("order_id", orderId)
    .order("created_at", { ascending: true });
  if (error) return [];
  return (data ?? []) as Array<{ to_status?: string | null; created_at?: string | null }>;
}

/** 방 최초 연결 시 주문 요약 system 메시지 1회 (idempotent). */
export async function appendStoreOrderMessengerOrderSummaryIfNeeded(
  sb: SupabaseClient<any>,
  orderId: string,
  ensuredRoom?: Extract<StoreOrderMessengerEnsureResult, { ok: true }>
): Promise<void> {
  const ensured =
    ensuredRoom ?? (await ensureStoreOrderMessengerRoom(sb, { orderId }));
  if (!ensured.ok) return;
  const summaryState = await loadStoreOrderSummaryMessageState(sb, ensured.roomId, orderId.trim());
  const loaded = await loadStoreOrderSummaryFields(sb, orderId.trim());
  if (!loaded) return;
  const content = formatStoreOrderSummaryForChatMessage(loaded.order, loaded.items, "buyer");
  if (!content.trim()) return;

  const { data: orderRow } = await sb
    .from("store_orders")
    .select("created_at, fulfillment_type, order_status")
    .eq("id", orderId.trim())
    .maybeSingle();
  const fulfillmentType = trimText((orderRow as { fulfillment_type?: unknown } | null)?.fulfillment_type) || loaded.order.fulfillment_type || "pickup";
  const orderStatus = trimText((orderRow as { order_status?: unknown } | null)?.order_status) || loaded.order.order_status || "pending";
  const orderCreatedAt = trimText((orderRow as { created_at?: unknown } | null)?.created_at);
  const statusEvents = await loadStoreOrderStatusEvents(sb, orderId.trim());
  const timeline = buildStoreOrderSummaryTimelineSteps({
    fulfillmentType,
    orderStatus,
    orderCreatedAt: orderCreatedAt || null,
    statusEvents,
  });

  const createdAt = nowIso();
  const metadata = {
    domain: "store_order",
    kind: "store_order_summary",
    storeOrderId: orderId.trim(),
    orderNo: loaded.order.order_no ?? null,
    fulfillmentType,
    orderStatus,
    timeline,
    order: {
      id: orderId.trim(),
      ...loaded.order,
      order_status: orderStatus,
    },
    items: loaded.items,
  };
  const updateSummaryId = summaryState.metadataSummaryId || summaryState.legacySystemSummaryId;
  if (updateSummaryId) {
    await sb
      .from("community_messenger_messages")
      .update({
        message_type: "system",
        content,
        metadata,
      })
      .eq("id", updateSummaryId)
      .eq("room_id", ensured.roomId);
    return;
  }
  const { data: inserted, error } = await sb
    .from("community_messenger_messages")
    .insert({
      room_id: ensured.roomId,
      sender_id: null,
      message_type: "system",
      content,
      metadata,
      created_at: createdAt,
    })
    .select("id")
    .single();
  if (error) return;
  await sb
    .from("community_messenger_rooms")
    .update({
      last_message: content.slice(0, 200),
      last_message_type: "system",
      last_message_at: createdAt,
      updated_at: createdAt,
    })
    .eq("id", ensured.roomId);
  const actor = ensured.buyerUserId;
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

  const ensured: Extract<StoreOrderMessengerEnsureResult, { ok: true }> = {
    ok: true,
    roomId,
    buyerUserId,
    ownerUserId,
    orderStatus: storeOrderStatusToShared(trimText(row.order_status)) ?? "pending",
    orderFlow: flowFromFulfillment(row.fulfillment_type),
    storeName: trimText(store?.store_name) || "매장",
    orderNo: trimText(row.order_no),
  };

  try {
    await appendStoreOrderMessengerOrderSummaryIfNeeded(sb, orderId, ensured);
  } catch {
    /* ignore */
  }

  return ensured;
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
    content: "결제·금액이 확정되었어요. 매장에서 확인하면 접수·준비 안내가 이어집니다.",
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

/** 허브 매장 1건 기준 주문 채팅 미읽음 합 — 전체 매장·전체 주문 스캔 금지 */
export async function countOwnerStoreOrderMessengerUnreadForHubStore(
  sb: SupabaseClient<any>,
  ownerUserId: string,
  hubStoreId: string
): Promise<number> {
  const uid = ownerUserId.trim();
  const sid = hubStoreId.trim();
  if (!uid || !sid) return 0;
  const { data: orders } = await sb
    .from("store_orders")
    .select("community_messenger_room_id")
    .eq("store_id", sid)
    .not("community_messenger_room_id", "is", null)
    .limit(80);
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

/** @deprecated 배지·허브는 `countOwnerStoreOrderMessengerUnreadForHubStore` 우선 */
export async function countOwnerStoreOrderMessengerUnread(
  sb: SupabaseClient<any>,
  ownerUserId: string
): Promise<number> {
  const uid = ownerUserId.trim();
  if (!uid) return 0;
  const { data: storeRow } = await sb.from("stores").select("id").eq("owner_user_id", uid).limit(1).maybeSingle();
  const hubStoreId = trimText((storeRow as { id?: unknown } | null)?.id);
  if (!hubStoreId) return 0;
  return countOwnerStoreOrderMessengerUnreadForHubStore(sb, uid, hubStoreId);
}

