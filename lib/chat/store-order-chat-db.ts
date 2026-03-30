/**
 * 매장 주문 채팅 — chat_rooms(room_type=store_order) + chat_messages
 * 거래/커뮤니티와 동일한 /chats · /api/chat/rooms/* 파이프라인에 태웁니다.
 */
import type { SupabaseClient } from "@supabase/supabase-js";
import type { SharedOrderStatus } from "@/lib/shared-orders/types";
import type { OrderChatFlow } from "@/lib/shared-order-chat/chat-message-builder";
import {
  SYSTEM_LINE_DELIVERY_ARRIVED,
  SYSTEM_LINE_DELIVERY_DONE,
  systemChatLineForOrderStatus,
} from "@/lib/shared-order-chat/chat-message-builder";
import { storeOrderStatusToShared } from "@/lib/store-commerce/map-order-status";

const TERMINAL: SharedOrderStatus[] = [
  "cancel_requested",
  "cancelled",
  "refund_requested",
  "refunded",
];

function happyPath(flow: OrderChatFlow): SharedOrderStatus[] {
  return flow === "delivery"
    ? ["pending", "accepted", "preparing", "ready_for_pickup", "delivering", "arrived", "completed"]
    : ["pending", "accepted", "preparing", "ready_for_pickup", "completed"];
}

function computeNextTowardTarget(
  cur: SharedOrderStatus,
  target: SharedOrderStatus,
  flow: OrderChatFlow
): SharedOrderStatus | null {
  if (target === cur) return null;
  if (TERMINAL.includes(target)) return target;

  const chain = happyPath(flow);
  let idxCur = chain.indexOf(cur);
  const idxTgt = chain.indexOf(target);
  if (idxTgt < 0) return null;

  if (idxCur < 0) {
    if (cur === "ready_for_pickup" && flow === "delivery") idxCur = chain.indexOf("ready_for_pickup");
    else if (cur === "delivering" && flow === "pickup") idxCur = chain.indexOf("preparing");
    else idxCur = -1;
  }

  if (idxCur < 0) return null;
  if (idxCur >= idxTgt) return null;
  return chain[idxCur + 1] ?? null;
}

function fulfillmentToFlow(ft: string | null | undefined): OrderChatFlow {
  return ft === "local_delivery" ? "delivery" : "pickup";
}

async function insertSystemMessage(
  sb: SupabaseClient<any>,
  roomId: string,
  body: string,
  relatedStatus?: SharedOrderStatus,
  incrementUnreadForUserIds?: string[],
  extraMetadata?: Record<string, unknown> | null
): Promise<string | null> {
  const meta: Record<string, unknown> = {
    store_order_system: true,
    ...(relatedStatus != null ? { related_order_status: relatedStatus } : {}),
    ...(extraMetadata && typeof extraMetadata === "object" ? extraMetadata : {}),
  };
  const { data: msg, error } = await sb
    .from("chat_messages")
    .insert({
      room_id: roomId,
      sender_id: null,
      message_type: "system",
      body,
      metadata: meta,
    })
    .select("id, created_at")
    .single();
  if (error || !msg) {
    console.error("[store-order-chat] insert system message", error);
    return null;
  }
  const id = (msg as { id: string }).id;
  const createdAt = (msg as { created_at: string }).created_at ?? new Date().toISOString();
  await sb
    .from("chat_rooms")
    .update({
      last_message_id: id,
      last_message_at: createdAt,
      last_message_preview: body.slice(0, 100),
      updated_at: createdAt,
    })
    .eq("id", roomId);

  if (incrementUnreadForUserIds?.length) {
    for (const uid of incrementUnreadForUserIds) {
      if (!uid) continue;
      const { data: pr } = await sb
        .from("chat_room_participants")
        .select("unread_count")
        .eq("room_id", roomId)
        .eq("user_id", uid)
        .maybeSingle();
      const cur = (pr as { unread_count?: number } | null)?.unread_count ?? 0;
      await sb
        .from("chat_room_participants")
        .update({ unread_count: cur + 1, updated_at: createdAt })
        .eq("room_id", roomId)
        .eq("user_id", uid);
    }
  }
  return id;
}

async function pushDeliveryCompletedPair(
  sb: SupabaseClient<any>,
  roomId: string,
  incrementUnreadForUserIds?: string[]
): Promise<void> {
  await insertSystemMessage(sb, roomId, SYSTEM_LINE_DELIVERY_ARRIVED, "delivering", incrementUnreadForUserIds);
  await insertSystemMessage(sb, roomId, SYSTEM_LINE_DELIVERY_DONE, "completed", incrementUnreadForUserIds);
}

/** 한 단계 상태 전환에 맞는 시스템 줄(배달 완료 2줄 포함) */
const PAYMENT_COMPLETED_CHAT_LINE =
  "주문이 등록되었어요. 매장에서 확인한 뒤 접수·준비가 진행되면 여기서도 안내가 올라와요.";

/** (레거시) PG·스텁 결제 기록 시 주문 채팅 시스템 줄 — 문구는 주문 등록 안내에 맞춤 */
export async function appendStoreOrderPaymentCompletedChatLine(
  sb: SupabaseClient<any>,
  orderId: string
): Promise<void> {
  const oid = orderId.trim();
  if (!oid) return;

  const { data: roomRow } = await sb
    .from("chat_rooms")
    .select("id, seller_id")
    .eq("store_order_id", oid)
    .eq("room_type", "store_order")
    .maybeSingle();
  const roomId = (roomRow as { id?: string } | null)?.id;
  if (!roomId) return;

  const sellerId = (roomRow as { seller_id?: string } | null)?.seller_id ?? "";
  await insertSystemMessage(
    sb,
    roomId,
    PAYMENT_COMPLETED_CHAT_LINE,
    undefined,
    sellerId ? [sellerId] : undefined
  );
}

export async function appendStoreOrderChatStatusTransition(
  sb: SupabaseClient<any>,
  orderId: string,
  previousDbStatus: string,
  nextDbStatus: string,
  opts?: { incrementUnreadForUserIds?: string[] }
): Promise<void> {
  const prev = storeOrderStatusToShared(previousDbStatus);
  const next = storeOrderStatusToShared(nextDbStatus);
  if (!next) return;

  /** 배달·픽업 완료 후에도 주문 채팅을 이어가도록 잠금 해제(레거시/오설정 is_locked 정리) */
  if (nextDbStatus === "completed" && previousDbStatus !== "completed") {
    try {
      await sb
        .from("chat_rooms")
        .update({
          is_locked: false,
          locked_at: null,
          locked_by: null,
          updated_at: new Date().toISOString(),
        })
        .eq("store_order_id", orderId.trim())
        .eq("room_type", "store_order");
    } catch {
      /* ignore */
    }
  }

  const { data: roomRow } = await sb
    .from("chat_rooms")
    .select("id, buyer_id, seller_id")
    .eq("store_order_id", orderId)
    .eq("room_type", "store_order")
    .maybeSingle();
  const roomId = (roomRow as { id?: string } | null)?.id;
  if (!roomId) return;

  const buyerId = (roomRow as { buyer_id?: string }).buyer_id ?? "";

  const { data: ord } = await sb
    .from("store_orders")
    .select("fulfillment_type")
    .eq("id", orderId)
    .maybeSingle();
  const flow = fulfillmentToFlow((ord as { fulfillment_type?: string } | null)?.fulfillment_type);

  const bump =
    opts?.incrementUnreadForUserIds?.filter(Boolean) ??
    (buyerId ? [buyerId] : undefined);

  if (next === "completed" && prev === "arrived" && flow === "delivery") {
    const doneLine = systemChatLineForOrderStatus("completed", flow);
    if (doneLine) await insertSystemMessage(sb, roomId, doneLine, "completed", bump);
    return;
  }
  /** 구 데이터: delivering에서 곧바로 완료된 경우 */
  if (next === "completed" && prev === "delivering" && flow === "delivery") {
    await pushDeliveryCompletedPair(sb, roomId, bump);
    return;
  }

  const line = systemChatLineForOrderStatus(next, flow);
  if (line) await insertSystemMessage(sb, roomId, line, next, bump);
}

/** 첫 진행 안내(pending) 삽입 후 호출: pending 단계는 위에서 이미 안내하므로 seed에서 중복 생략 */
async function seedRoomMessagesToStatusAfterSummary(
  sb: SupabaseClient<any>,
  roomId: string,
  target: SharedOrderStatus,
  flow: OrderChatFlow
): Promise<void> {
  if (target === "pending") return;

  let last: SharedOrderStatus = "pending";
  let guard = 0;
  while (last !== target && guard++ < 24) {
    const next = computeNextTowardTarget(last, target, flow);
    if (next == null) {
      if (TERMINAL.includes(target)) {
        const tline = systemChatLineForOrderStatus(target, flow);
        if (tline) await insertSystemMessage(sb, roomId, tline, target);
      }
      break;
    }
    if (next === "completed" && last === "arrived" && flow === "delivery") {
      const doneLine = systemChatLineForOrderStatus("completed", flow);
      if (doneLine) await insertSystemMessage(sb, roomId, doneLine, "completed");
      last = "completed";
      break;
    }
    if (next === "completed" && last === "delivering" && flow === "delivery") {
      await pushDeliveryCompletedPair(sb, roomId);
      last = "completed";
      break;
    }
    const line = systemChatLineForOrderStatus(next, flow);
    if (line) await insertSystemMessage(sb, roomId, line, next);
    last = next;
  }
}

/** 주문 상세(품목·주소·결제)는 채팅에 넣지 않고, 진행 상태 첫 줄만 삽입 */
async function insertStoreOrderInitialProgressLine(
  sb: SupabaseClient<any>,
  roomId: string,
  orderId: string,
  sellerId: string
): Promise<void> {
  const oid = orderId.trim();
  if (!oid) return;

  const { data: ord, error: oErr } = await sb
    .from("store_orders")
    .select("fulfillment_type")
    .eq("id", oid)
    .maybeSingle();
  if (oErr || !ord) {
    console.error("[store-order-chat] initial progress line load order", oErr);
    return;
  }

  const flow = fulfillmentToFlow((ord as { fulfillment_type?: string }).fulfillment_type);
  const line = systemChatLineForOrderStatus("pending", flow);
  if (!line) return;

  await insertSystemMessage(sb, roomId, line, "pending", sellerId ? [sellerId] : undefined);
}

/**
 * 주문당 채팅방 1개 보장. 이미 있으면 room id만 반환.
 */
export async function ensureStoreOrderChatRoom(
  sb: SupabaseClient<any>,
  orderId: string
): Promise<{ ok: true; roomId: string } | { ok: false; error: string }> {
  const oid = orderId.trim();
  if (!oid) return { ok: false, error: "missing_order_id" };

  const { data: existing } = await sb
    .from("chat_rooms")
    .select("id")
    .eq("store_order_id", oid)
    .eq("room_type", "store_order")
    .maybeSingle();
  if (existing?.id) return { ok: true, roomId: existing.id as string };

  const { data: ord, error: oErr } = await sb
    .from("store_orders")
    .select("id, buyer_user_id, store_id, order_no, order_status, fulfillment_type")
    .eq("id", oid)
    .maybeSingle();
  if (oErr || !ord) return { ok: false, error: "order_not_found" };

  const buyerId = ord.buyer_user_id as string;
  const storeId = ord.store_id as string;

  const { data: st, error: sErr } = await sb
    .from("stores")
    .select("owner_user_id, store_name")
    .eq("id", storeId)
    .maybeSingle();
  if (sErr || !st?.owner_user_id) return { ok: false, error: "store_not_found" };

  const ownerId = st.owner_user_id as string;
  const flow = fulfillmentToFlow(ord.fulfillment_type as string);
  const stShared = storeOrderStatusToShared(ord.order_status as string) ?? "pending";

  const { data: room, error: rErr } = await sb
    .from("chat_rooms")
    .insert({
      room_type: "store_order",
      store_order_id: oid,
      seller_id: ownerId,
      buyer_id: buyerId,
      initiator_id: buyerId,
      peer_id: ownerId,
      item_id: null,
      request_status: "none",
      trade_status: "inquiry",
    })
    .select("id")
    .single();

  if (rErr || !room?.id) {
    console.error("[store-order-chat] insert room", rErr);
    return { ok: false, error: rErr?.message ?? "room_insert_failed" };
  }

  const roomId = room.id as string;

  const now = new Date().toISOString();
  const parts = [
    { room_id: roomId, user_id: buyerId, role_in_room: "buyer" as const },
    { room_id: roomId, user_id: ownerId, role_in_room: "seller" as const },
  ];
  const { error: pErr } = await sb.from("chat_room_participants").insert(
    parts.map((p) => ({
      ...p,
      joined_at: now,
      is_active: true,
      hidden: false,
      unread_count: 0,
    }))
  );
  if (pErr) {
    console.error("[store-order-chat] participants", pErr);
    await sb.from("chat_rooms").delete().eq("id", roomId);
    return { ok: false, error: pErr.message };
  }

  await insertStoreOrderInitialProgressLine(sb, roomId, oid, ownerId);
  await seedRoomMessagesToStatusAfterSummary(sb, roomId, stShared, flow);

  return { ok: true, roomId };
}

/**
 * 매장 주문 채팅방 접근 보정 — `GET /api/chat/room/[id]` 등에서 403 방지.
 * - `chat_rooms.buyer_id` / `seller_id` 누락 시 `store_orders`·`stores`로 채움
 * - `chat_room_participants` 누락·숨김·퇴장·비활성 시 구매자·점주 행 복구
 */
export async function ensureStoreOrderChatRoomAccessForUser(
  sb: SupabaseClient<any>,
  roomId: string,
  userId: string
): Promise<
  | { ok: true; buyerId: string; sellerId: string; unreadCount: number }
  | { ok: false; reason: "not_member" | "room_not_found" }
> {
  const rid = roomId.trim();
  const uid = userId.trim();
  if (!rid || !uid) return { ok: false, reason: "not_member" };

  const { data: cr, error: crErr } = await sb
    .from("chat_rooms")
    .select("id, room_type, store_order_id, buyer_id, seller_id")
    .eq("id", rid)
    .eq("room_type", "store_order")
    .maybeSingle();
  if (crErr || !cr) return { ok: false, reason: "room_not_found" };

  let buyerId = typeof cr.buyer_id === "string" && cr.buyer_id.trim() ? cr.buyer_id.trim() : "";
  let sellerId = typeof cr.seller_id === "string" && cr.seller_id.trim() ? cr.seller_id.trim() : "";
  const oid =
    typeof cr.store_order_id === "string" && cr.store_order_id.trim() ? cr.store_order_id.trim() : "";

  if ((!buyerId || !sellerId) && oid) {
    const { data: ord } = await sb
      .from("store_orders")
      .select("buyer_user_id, store_id")
      .eq("id", oid)
      .maybeSingle();
    const sid = (ord as { store_id?: string } | null)?.store_id;
    const { data: st } =
      sid ?
        await sb.from("stores").select("owner_user_id").eq("id", sid).maybeSingle()
      : { data: null };
    const b = String((ord as { buyer_user_id?: string } | null)?.buyer_user_id ?? "").trim();
    const s = String((st as { owner_user_id?: string } | null)?.owner_user_id ?? "").trim();
    if (b && s) {
      buyerId = b;
      sellerId = s;
      await sb
        .from("chat_rooms")
        .update({
          buyer_id: b,
          seller_id: s,
          initiator_id: b,
          peer_id: s,
          updated_at: new Date().toISOString(),
        })
        .eq("id", rid);
    }
  }

  if (!buyerId || !sellerId) return { ok: false, reason: "not_member" };
  if (uid !== buyerId && uid !== sellerId) return { ok: false, reason: "not_member" };

  const now = new Date().toISOString();
  const tuples: Array<{ u: string; role: "buyer" | "seller" }> = [
    { u: buyerId, role: "buyer" },
    { u: sellerId, role: "seller" },
  ];
  for (const t of tuples) {
    const { data: pr } = await sb
      .from("chat_room_participants")
      .select("unread_count, hidden, left_at, is_active")
      .eq("room_id", rid)
      .eq("user_id", t.u)
      .maybeSingle();
    const rec = pr as {
      unread_count?: number;
      hidden?: boolean | null;
      left_at?: string | null;
      is_active?: boolean | null;
    } | null;
    const needs =
      !rec ||
      rec.hidden === true ||
      (rec.left_at != null && String(rec.left_at).trim() !== "") ||
      rec.is_active === false;
    if (!needs) continue;
    const { error: upErr } = await sb.from("chat_room_participants").upsert(
      {
        room_id: rid,
        user_id: t.u,
        role_in_room: t.role,
        joined_at: now,
        is_active: true,
        hidden: false,
        left_at: null,
        unread_count: rec?.unread_count ?? 0,
      },
      { onConflict: "room_id,user_id" }
    );
    if (upErr) {
      console.error("[store-order-chat] ensure participant upsert", upErr);
    }
  }

  const { data: mePart } = await sb
    .from("chat_room_participants")
    .select("unread_count, hidden, left_at, is_active")
    .eq("room_id", rid)
    .eq("user_id", uid)
    .maybeSingle();
  const me = mePart as {
    unread_count?: number;
    hidden?: boolean | null;
    left_at?: string | null;
    is_active?: boolean | null;
  } | null;
  if (!me || me.hidden === true || me.left_at != null || me.is_active === false) {
    return { ok: false, reason: "not_member" };
  }

  return {
    ok: true,
    buyerId,
    sellerId,
    unreadCount: me.unread_count ?? 0,
  };
}
