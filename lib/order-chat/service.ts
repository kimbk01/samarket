import type { SupabaseClient } from "@supabase/supabase-js";
import type { SharedOrderStatus } from "@/lib/shared-orders/types";
import type { OrderChatFlow } from "@/lib/shared-order-chat/chat-message-builder";
import {
  SYSTEM_LINE_DELIVERY_ARRIVED,
  SYSTEM_LINE_DELIVERY_DONE,
  systemChatLineForOrderStatus,
} from "@/lib/shared-order-chat/chat-message-builder";
import { storeOrderStatusToShared } from "@/lib/store-commerce/map-order-status";
import { fetchNicknamesForUserIds } from "@/lib/chats/resolve-author-nickname";
import type {
  OrderChatMessagePublic,
  OrderChatRole,
  OrderChatRoomPublic,
  OrderChatSnapshot,
} from "./types";
import { CHAT_ROOM_ID_IN_CHUNK_SIZE, chunkIds } from "@/lib/chats/chat-list-limits";
import { ORDER_CHAT_MESSAGE_ROW_SELECT, ORDER_CHAT_ROOM_ROW_SELECT } from "@/lib/order-chat/order-chat-select";

/**
 * 주문 채팅(`order_chat_*`)과 별개인 커뮤니티 메신저 방에 거래/배달 목록 메타를 넣을 때는
 * `updateCommunityMessengerRoomContextMeta` 또는 PATCH `context_meta` (`lib/community-messenger/service`, API route) 를 사용한다.
 */

const TERMINAL: SharedOrderStatus[] = [
  "cancel_requested",
  "cancelled",
  "refund_requested",
  "refunded",
];

function nowIso() {
  return new Date().toISOString();
}

function fulfillmentToFlow(ft: string | null | undefined): OrderChatFlow {
  return ft === "local_delivery" ? "delivery" : "pickup";
}

function fallbackDisplayName(userId: string, label: string) {
  return label.trim() || userId.replace(/-/g, "").slice(0, 8) || "사용자";
}

async function resolveOrderChatIdentity(
  sb: SupabaseClient<any>,
  input: {
    buyerUserId: string;
    ownerUserId: string;
    storeName: string;
  }
) {
  const nickMap = await fetchNicknamesForUserIds(sb, [input.buyerUserId, input.ownerUserId]);
  const buyerNick = nickMap.get(input.buyerUserId)?.trim() ?? null;
  const ownerNick = nickMap.get(input.ownerUserId)?.trim() ?? null;
  return {
    buyerName: fallbackDisplayName(input.buyerUserId, buyerNick ?? ""),
    ownerName: fallbackDisplayName(input.ownerUserId, input.storeName || ownerNick || ""),
  };
}

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
  if (idxCur < 0 || idxCur >= idxTgt) return null;
  return chain[idxCur + 1] ?? null;
}

async function getRoomByOrderId(sb: SupabaseClient<any>, orderId: string) {
  const { data } = await sb.from("order_chat_rooms").select(ORDER_CHAT_ROOM_ROW_SELECT).eq("order_id", orderId).maybeSingle();
  return (data as OrderChatRoomPublic | null) ?? null;
}

async function touchRoomSummary(
  sb: SupabaseClient<any>,
  roomId: string,
  patch: Partial<OrderChatRoomPublic>
) {
  await sb.from("order_chat_rooms").update({ ...patch, updated_at: nowIso() }).eq("id", roomId);
}

async function incrementParticipantUnread(
  sb: SupabaseClient<any>,
  roomId: string,
  role: OrderChatRole
) {
  const { data } = await sb
    .from("order_chat_participants")
    .select("id, unread_count")
    .eq("room_id", roomId)
    .eq("role", role)
    .eq("is_active", true)
    .maybeSingle();
  const row = data as { id?: string; unread_count?: number } | null;
  if (!row?.id) return;
  await sb
    .from("order_chat_participants")
    .update({ unread_count: (row.unread_count ?? 0) + 1, updated_at: nowIso() })
    .eq("id", row.id);
}

async function insertOrderChatMessage(
  sb: SupabaseClient<any>,
  input: {
    room: OrderChatRoomPublic;
    senderType: "buyer" | "owner" | "system";
    senderId: string | null;
    senderName: string;
    messageType: "text" | "system";
    content: string;
    imageUrl?: string | null;
    relatedOrderStatus?: SharedOrderStatus | null;
    incrementUnreadFor?: OrderChatRole | null;
  }
): Promise<OrderChatMessagePublic | null> {
  const createdAt = nowIso();
  const { data, error } = await sb
    .from("order_chat_messages")
    .insert({
      room_id: input.room.id,
      order_id: input.room.order_id,
      sender_type: input.senderType,
      sender_id: input.senderId,
      sender_name: input.senderName,
      message_type: input.messageType,
      content: input.content,
      image_url: input.imageUrl ?? null,
      related_order_status: input.relatedOrderStatus ?? null,
      is_read_by_buyer: input.senderType === "buyer",
      is_read_by_owner: input.senderType === "owner",
      is_read_by_admin: false,
      created_at: createdAt,
    })
    .select(ORDER_CHAT_MESSAGE_ROW_SELECT)
    .single();
  if (error || !data) {
    console.error("[order-chat] insert message", error);
    return null;
  }
  const nextPatch: Partial<OrderChatRoomPublic> = {
    last_message: input.content.slice(0, 200),
    last_message_at: createdAt,
  };
  if (input.incrementUnreadFor === "buyer") {
    nextPatch.unread_count_buyer = (input.room.unread_count_buyer ?? 0) + 1;
    await incrementParticipantUnread(sb, input.room.id, "buyer");
  } else if (input.incrementUnreadFor === "owner") {
    nextPatch.unread_count_owner = (input.room.unread_count_owner ?? 0) + 1;
    await incrementParticipantUnread(sb, input.room.id, "owner");
  }
  if (input.relatedOrderStatus !== undefined) {
    nextPatch.last_chat_order_status = input.relatedOrderStatus;
  }
  await touchRoomSummary(sb, input.room.id, nextPatch);
  return data as unknown as OrderChatMessagePublic;
}

async function pushDeliveryCompletedPair(
  sb: SupabaseClient<any>,
  room: OrderChatRoomPublic,
  incrementUnreadFor?: OrderChatRole | null
): Promise<void> {
  const sysName = room.store_name || "시스템";
  const afterArrived = { ...room, last_chat_order_status: "arrived" as const };
  await insertOrderChatMessage(sb, {
    room,
    senderType: "system",
    senderId: null,
    senderName: sysName,
    messageType: "system",
    content: SYSTEM_LINE_DELIVERY_ARRIVED,
    relatedOrderStatus: "arrived",
    incrementUnreadFor,
  });
  await insertOrderChatMessage(sb, {
    room: afterArrived,
    senderType: "system",
    senderId: null,
    senderName: sysName,
    messageType: "system",
    content: SYSTEM_LINE_DELIVERY_DONE,
    relatedOrderStatus: "completed",
    incrementUnreadFor,
  });
}

async function insertInitialProgressLine(
  sb: SupabaseClient<any>,
  room: OrderChatRoomPublic,
  incrementUnreadFor?: OrderChatRole | null
) {
  const line = systemChatLineForOrderStatus("pending", room.order_flow);
  if (!line) return;
  await insertOrderChatMessage(sb, {
    room,
    senderType: "system",
    senderId: null,
    senderName: room.store_name || "시스템",
    messageType: "system",
    content: line,
    relatedOrderStatus: "pending",
    incrementUnreadFor,
  });
}

async function seedRoomMessagesToStatusAfterSummary(
  sb: SupabaseClient<any>,
  room: OrderChatRoomPublic,
  target: SharedOrderStatus
) {
  if (target === "pending") return;
  let last: SharedOrderStatus = "pending";
  let roomCursor = { ...room, last_chat_order_status: "pending" as SharedOrderStatus };
  let guard = 0;
  while (last !== target && guard++ < 24) {
    const next = computeNextTowardTarget(last, target, room.order_flow);
    if (next == null) {
      if (TERMINAL.includes(target)) {
        const tline = systemChatLineForOrderStatus(target, room.order_flow);
        if (tline) {
          await insertOrderChatMessage(sb, {
            room: roomCursor,
            senderType: "system",
            senderId: null,
            senderName: room.store_name || "시스템",
            messageType: "system",
            content: tline,
            relatedOrderStatus: target,
          });
        }
      }
      break;
    }
    if (next === "completed" && last === "delivering" && room.order_flow === "delivery") {
      await pushDeliveryCompletedPair(sb, roomCursor);
      last = "completed";
      break;
    }
    const line = systemChatLineForOrderStatus(next, room.order_flow);
    if (line) {
      await insertOrderChatMessage(sb, {
        room: roomCursor,
        senderType: "system",
        senderId: null,
        senderName: room.store_name || "시스템",
        messageType: "system",
        content: line,
        relatedOrderStatus: next,
      });
      roomCursor = { ...roomCursor, last_chat_order_status: next };
    }
    last = next;
  }
}

export async function ensureOrderChatRoom(
  sb: SupabaseClient<any>,
  orderId: string
): Promise<{ ok: true; room: OrderChatRoomPublic } | { ok: false; error: string }> {
  const oid = orderId.trim();
  if (!oid) return { ok: false, error: "missing_order_id" };
  const existing = await getRoomByOrderId(sb, oid);
  if (existing) return { ok: true, room: existing };

  const { data: order, error: orderErr } = await sb
    .from("store_orders")
    .select("id, order_no, store_id, buyer_user_id, order_status, fulfillment_type")
    .eq("id", oid)
    .maybeSingle();
  if (orderErr || !order) return { ok: false, error: "order_not_found" };

  const { data: store, error: storeErr } = await sb
    .from("stores")
    .select("id, store_name, owner_user_id")
    .eq("id", String((order as { store_id?: string }).store_id ?? ""))
    .maybeSingle();
  if (storeErr || !store) return { ok: false, error: "store_not_found" };

  const buyerUserId = String((order as { buyer_user_id?: string }).buyer_user_id ?? "").trim();
  const ownerUserId = String((store as { owner_user_id?: string }).owner_user_id ?? "").trim();
  if (!buyerUserId || !ownerUserId) return { ok: false, error: "participants_missing" };

  const storeName = String((store as { store_name?: string }).store_name ?? "").trim() || "매장";
  const identity = await resolveOrderChatIdentity(sb, {
    buyerUserId,
    ownerUserId,
    storeName,
  });
  const flow = fulfillmentToFlow((order as { fulfillment_type?: string }).fulfillment_type as string);
  const orderStatus = storeOrderStatusToShared(String((order as { order_status?: string }).order_status ?? "")) ?? "pending";
  const roomInsert = {
    order_id: oid,
    order_no: String((order as { order_no?: string }).order_no ?? "").trim(),
    store_id: String((order as { store_id?: string }).store_id ?? "").trim(),
    store_name: storeName,
    buyer_user_id: buyerUserId,
    buyer_name: identity.buyerName,
    owner_user_id: ownerUserId,
    owner_name: identity.ownerName,
    order_flow: flow,
    room_status: "active" as const,
    last_message: "",
    last_message_at: nowIso(),
    unread_count_buyer: 0,
    unread_count_owner: 0,
    unread_count_admin: 0,
    last_chat_order_status: null,
  };
  const { data: roomData, error: roomErr } = await sb
    .from("order_chat_rooms")
    .insert(roomInsert)
    .select(ORDER_CHAT_ROOM_ROW_SELECT)
    .single();
  if (roomErr || !roomData) {
    console.error("[order-chat] insert room", roomErr);
    return { ok: false, error: roomErr?.message ?? "room_insert_failed" };
  }
  const room = roomData as unknown as OrderChatRoomPublic;
  const { error: partErr } = await sb.from("order_chat_participants").insert([
    {
      room_id: room.id,
      user_id: buyerUserId,
      role: "buyer",
      unread_count: 0,
      is_active: true,
    },
    {
      room_id: room.id,
      user_id: ownerUserId,
      role: "owner",
      unread_count: 0,
      is_active: true,
    },
  ]);
  if (partErr) {
    console.error("[order-chat] insert participants", partErr);
    return { ok: false, error: partErr.message };
  }

  await insertInitialProgressLine(sb, room, "owner");
  const seededRoom = (await getRoomByOrderId(sb, oid)) ?? room;
  await seedRoomMessagesToStatusAfterSummary(sb, seededRoom, orderStatus);
  const reread = await getRoomByOrderId(sb, oid);
  return reread ? { ok: true, room: reread } : { ok: true, room: seededRoom };
}

async function getOrderWithRoomForUser(
  sb: SupabaseClient<any>,
  orderId: string,
  userId: string
): Promise<{ room: OrderChatRoomPublic; role: OrderChatRole; orderStatus: SharedOrderStatus } | null> {
  const ensured = await ensureOrderChatRoom(sb, orderId);
  if (!ensured.ok) return null;
  const room = ensured.room;
  const uid = userId.trim();
  let role: OrderChatRole | null = null;
  if (room.buyer_user_id === uid) role = "buyer";
  if (room.owner_user_id === uid) role = "owner";
  if (!role) {
    const { data: store } = await sb.from("stores").select("owner_user_id").eq("id", room.store_id).maybeSingle();
    if (String((store as { owner_user_id?: string } | null)?.owner_user_id ?? "").trim() === uid) {
      role = "owner";
    }
  }
  if (!role) return null;
  const { data: order } = await sb
    .from("store_orders")
    .select("order_status")
    .eq("id", orderId)
    .maybeSingle();
  const orderStatus =
    storeOrderStatusToShared(String((order as { order_status?: string } | null)?.order_status ?? "")) ?? "pending";
  return { room, role, orderStatus };
}

export async function getOrderChatSnapshotForUser(
  sb: SupabaseClient<any>,
  orderId: string,
  userId: string,
  opts?: { messageLimit?: number }
): Promise<{ ok: true; snapshot: OrderChatSnapshot } | { ok: false; error: string; status: number }> {
  const match = await getOrderWithRoomForUser(sb, orderId, userId);
  if (!match) return { ok: false, error: "forbidden", status: 403 };
  const requested =
    typeof opts?.messageLimit === "number" && Number.isFinite(opts.messageLimit)
      ? Math.min(200, Math.max(1, Math.floor(opts.messageLimit)))
      : 0;
  const useLimit = requested > 0;

  let q = sb
    .from("order_chat_messages")
    .select(ORDER_CHAT_MESSAGE_ROW_SELECT)
    .eq("room_id", match.room.id)
    .order("created_at", { ascending: useLimit ? false : true });
  if (useLimit) {
    q = q.limit(requested);
  }
  const { data } = await q;
  const raw = (data ?? []) as unknown as OrderChatMessagePublic[];
  const chronological = useLimit ? raw.slice().reverse() : raw;
  const messagesCapped = useLimit && raw.length >= requested;
  return {
    ok: true,
    snapshot: {
      room: match.room,
      role: match.role,
      orderStatus: match.orderStatus,
      messages: chronological,
      ...(messagesCapped ? { messagesCapped: true as const } : {}),
    },
  };
}

async function insertOrderChatAdminNoteMessage(
  sb: SupabaseClient<any>,
  input: {
    room: OrderChatRoomPublic;
    adminUserId: string;
    adminDisplayName: string;
    content: string;
  }
): Promise<OrderChatMessagePublic | null> {
  const text = input.content.trim();
  if (!text) return null;
  const createdAt = nowIso();
  const { data, error } = await sb
    .from("order_chat_messages")
    .insert({
      room_id: input.room.id,
      order_id: input.room.order_id,
      sender_type: "admin",
      sender_id: input.adminUserId,
      sender_name: input.adminDisplayName.slice(0, 120),
      message_type: "admin_note",
      content: text,
      image_url: null,
      related_order_status: null,
      is_read_by_buyer: false,
      is_read_by_owner: false,
      is_read_by_admin: true,
      created_at: createdAt,
    })
    .select(ORDER_CHAT_MESSAGE_ROW_SELECT)
    .single();
  if (error || !data) {
    console.error("[order-chat] insert admin_note", error);
    return null;
  }
  const { data: roomRow } = await sb
    .from("order_chat_rooms")
    .select(ORDER_CHAT_ROOM_ROW_SELECT)
    .eq("id", input.room.id)
    .maybeSingle();
  const r = (roomRow ?? input.room) as OrderChatRoomPublic;
  await sb
    .from("order_chat_rooms")
    .update({
      last_message: text.slice(0, 200),
      last_message_at: createdAt,
      unread_count_buyer: (r.unread_count_buyer ?? 0) + 1,
      unread_count_owner: (r.unread_count_owner ?? 0) + 1,
      updated_at: createdAt,
    })
    .eq("id", input.room.id);
  await incrementParticipantUnread(sb, input.room.id, "buyer");
  await incrementParticipantUnread(sb, input.room.id, "owner");
  return data as unknown as OrderChatMessagePublic;
}

/**
 * 관리자 전용 — 구매자/사장이 아니어도 방·메시지를 조회 (운영 모니터링).
 */
export async function getOrderChatSnapshotForAdmin(
  sb: SupabaseClient<any>,
  orderId: string
): Promise<
  | { ok: true; room: OrderChatRoomPublic; orderStatus: SharedOrderStatus; messages: OrderChatMessagePublic[] }
  | { ok: false; error: string; status: number }
> {
  const ensured = await ensureOrderChatRoom(sb, orderId);
  if (!ensured.ok) {
    const e = ensured.error;
    if (e === "order_not_found") return { ok: false, error: e, status: 404 };
    return { ok: false, error: e, status: 500 };
  }
  const room = ensured.room;
  const { data: order } = await sb.from("store_orders").select("order_status").eq("id", orderId).maybeSingle();
  const orderStatus =
    storeOrderStatusToShared(String((order as { order_status?: string } | null)?.order_status ?? "")) ?? "pending";
  const { data, error } = await sb
    .from("order_chat_messages")
    .select(ORDER_CHAT_MESSAGE_ROW_SELECT)
    .eq("room_id", room.id)
    .order("created_at", { ascending: true });
  if (error) {
    return { ok: false, error: error.message, status: 500 };
  }
  return {
    ok: true,
    room,
    orderStatus,
    messages: (data ?? []) as unknown as OrderChatMessagePublic[],
  };
}

/**
 * 관리자 허브 — 최근 주문 채팅 방 목록 (`order_chat_rooms` 원장).
 */
export async function listOrderChatRoomsForAdmin(
  sb: SupabaseClient<any>,
  opts: { limit: number }
): Promise<{ ok: true; rooms: OrderChatRoomPublic[] } | { ok: false; error: string }> {
  const limit = Math.min(Math.max(opts.limit, 1), 300);
  const { data, error } = await sb
    .from("order_chat_rooms")
    .select(ORDER_CHAT_ROOM_ROW_SELECT)
    .order("last_message_at", { ascending: false })
    .limit(limit);

  if (error) {
    const e = error as { code?: string; message?: string };
    const m = String(e?.message ?? "").toLowerCase();
    const missingTable = e?.code === "42P01" || (m.includes("relation") && m.includes("does not exist"));
    if (missingTable) {
      return { ok: true, rooms: [] };
    }
    return { ok: false, error: error.message };
  }
  return { ok: true, rooms: (data ?? []) as OrderChatRoomPublic[] };
}

type ListRoomsForMeInput =
  | { userId: string; mode: "buyer" }
  | { userId: string; mode: "owner"; storeId: string };

/**
 * 구매자: 본인 `buyer_user_id` 방 전체.
 * 사장: `store_id`가 필수이며, `stores.owner_user_id === userId`일 때만 해당 매장 방 목록.
 */
export async function listOrderChatRoomsForMe(
  sb: SupabaseClient<any>,
  input: ListRoomsForMeInput
): Promise<{ ok: true; rooms: OrderChatRoomPublic[] } | { ok: false; error: string; status?: number }> {
  const uid = input.userId.trim();
  if (!uid) return { ok: false, error: "missing_user", status: 400 };

  if (input.mode === "owner") {
    const sid = input.storeId.trim();
    if (!sid) return { ok: false, error: "missing_store_id", status: 400 };
    const { data: st, error: stErr } = await sb.from("stores").select("owner_user_id").eq("id", sid).maybeSingle();
    if (stErr) return { ok: false, error: stErr.message, status: 500 };
    const ownerId = String((st as { owner_user_id?: string } | null)?.owner_user_id ?? "").trim();
    if (ownerId !== uid) return { ok: false, error: "forbidden", status: 403 };
  }

  let q = sb
    .from("order_chat_rooms")
    .select(ORDER_CHAT_ROOM_ROW_SELECT)
    .order("last_message_at", { ascending: false })
    .limit(200);

  if (input.mode === "buyer") {
    q = q.eq("buyer_user_id", uid);
  } else {
    q = q.eq("owner_user_id", uid).eq("store_id", input.storeId.trim());
  }

  const { data, error } = await q;
  if (error) {
    const e = error as { code?: string; message?: string };
    const m = String(e?.message ?? "").toLowerCase();
    const missingTable = e?.code === "42P01" || (m.includes("relation") && m.includes("does not exist"));
    if (missingTable) return { ok: true, rooms: [] };
    return { ok: false, error: error.message, status: 500 };
  }
  return { ok: true, rooms: (data ?? []) as OrderChatRoomPublic[] };
}

export async function sendOrderChatAdminNote(
  sb: SupabaseClient<any>,
  input: { orderId: string; adminUserId: string; text: string }
): Promise<{ ok: true; message: OrderChatMessagePublic } | { ok: false; error: string; status: number }> {
  const ensured = await ensureOrderChatRoom(sb, input.orderId);
  if (!ensured.ok) {
    const e = ensured.error;
    if (e === "order_not_found") return { ok: false, error: e, status: 404 };
    return { ok: false, error: e, status: 500 };
  }
  if (ensured.room.room_status === "blocked") return { ok: false, error: "room_blocked", status: 403 };
  const t = input.text.trim();
  if (!t) return { ok: false, error: "empty_message", status: 400 };
  const nickMap = await fetchNicknamesForUserIds(sb, [input.adminUserId]);
  const adminName = nickMap.get(input.adminUserId)?.trim() || "관리자";
  const message = await insertOrderChatAdminNoteMessage(sb, {
    room: ensured.room,
    adminUserId: input.adminUserId,
    adminDisplayName: adminName,
    content: t,
  });
  if (!message) return { ok: false, error: "send_failed", status: 500 };
  return { ok: true, message };
}

export async function sendOrderChatTextForUser(
  sb: SupabaseClient<any>,
  input: { orderId: string; userId: string; text: string }
): Promise<{ ok: true; message: OrderChatMessagePublic } | { ok: false; error: string; status: number }> {
  const match = await getOrderWithRoomForUser(sb, input.orderId, input.userId);
  if (!match) return { ok: false, error: "forbidden", status: 403 };
  const text = input.text.trim();
  if (!text) return { ok: false, error: "empty_message", status: 400 };
  if (match.room.room_status === "blocked") return { ok: false, error: "room_blocked", status: 403 };
  const message = await insertOrderChatMessage(sb, {
    room: match.room,
    senderType: match.role,
    senderId: input.userId,
    senderName: match.role === "buyer" ? match.room.buyer_name : match.room.owner_name,
    messageType: "text",
    content: text,
    incrementUnreadFor: match.role === "buyer" ? "owner" : "buyer",
  });
  if (!message) return { ok: false, error: "send_failed", status: 500 };
  return { ok: true, message };
}

export async function markOrderChatReadForUser(
  sb: SupabaseClient<any>,
  input: { orderId: string; userId: string }
): Promise<{ ok: true } | { ok: false; error: string; status: number }> {
  const match = await getOrderWithRoomForUser(sb, input.orderId, input.userId);
  if (!match) return { ok: false, error: "forbidden", status: 403 };
  const role = match.role;
  const now = nowIso();
  const { data: last } = await sb
    .from("order_chat_messages")
    .select("id")
    .eq("room_id", match.room.id)
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();
  await sb
    .from("order_chat_participants")
    .update({
      unread_count: 0,
      last_read_message_id: String((last as { id?: string } | null)?.id ?? "") || null,
      last_read_at: now,
      updated_at: now,
    })
    .eq("room_id", match.room.id)
    .eq("user_id", input.userId)
    .eq("role", role);
  if (role === "buyer") {
    await sb
      .from("order_chat_rooms")
      .update({ unread_count_buyer: 0, updated_at: now })
      .eq("id", match.room.id);
    await sb
      .from("order_chat_messages")
      .update({ is_read_by_buyer: true })
      .eq("room_id", match.room.id)
      .eq("is_read_by_buyer", false);
  } else {
    await sb
      .from("order_chat_rooms")
      .update({ unread_count_owner: 0, updated_at: now })
      .eq("id", match.room.id);
    await sb
      .from("order_chat_messages")
      .update({ is_read_by_owner: true })
      .eq("room_id", match.room.id)
      .eq("is_read_by_owner", false);
  }
  return { ok: true };
}

export async function getBuyerOrderChatUnreadMap(
  sb: SupabaseClient<any>,
  buyerUserId: string,
  orderIds: string[]
): Promise<Record<string, number>> {
  const ids = orderIds.map((id) => id.trim()).filter(Boolean);
  if (!ids.length) return {};
  const { data } = await sb
    .from("order_chat_rooms")
    .select("order_id, unread_count_buyer")
    .eq("buyer_user_id", buyerUserId)
    .in("order_id", ids);
  const map: Record<string, number> = {};
  for (const row of data ?? []) {
    const oid = String((row as { order_id?: string }).order_id ?? "").trim();
    if (!oid) continue;
    map[oid] = Math.max(0, Number((row as { unread_count_buyer?: number }).unread_count_buyer) || 0);
  }
  return map;
}

export async function countOwnerOrderChatUnread(
  sb: SupabaseClient<any>,
  ownerUserId: string
): Promise<number> {
  const { data } = await sb
    .from("order_chat_rooms")
    .select("unread_count_owner")
    .eq("owner_user_id", ownerUserId)
    .in("room_status", ["active", "admin_review"]);
  return (data ?? []).reduce(
    (sum, row) => sum + Math.max(0, Number((row as { unread_count_owner?: number }).unread_count_owner) || 0),
    0
  );
}

export async function appendOrderChatPaymentCompletedLine(
  sb: SupabaseClient<any>,
  orderId: string
): Promise<void> {
  const ensured = await ensureOrderChatRoom(sb, orderId);
  if (!ensured.ok) return;
  await insertOrderChatMessage(sb, {
    room: ensured.room,
    senderType: "system",
    senderId: null,
    senderName: ensured.room.store_name || "시스템",
    messageType: "system",
    content: "주문이 등록되었어요. 매장에서 확인한 뒤 접수·준비가 진행되면 여기서도 안내가 올라와요.",
    incrementUnreadFor: "owner",
  });
}

export async function appendOrderChatStatusTransition(
  sb: SupabaseClient<any>,
  orderId: string,
  previousDbStatus: string,
  nextDbStatus: string
): Promise<void> {
  const prev = storeOrderStatusToShared(previousDbStatus);
  const next = storeOrderStatusToShared(nextDbStatus);
  if (!next) return;
  const ensured = await ensureOrderChatRoom(sb, orderId);
  if (!ensured.ok) return;
  const room = ensured.room;
  if (next === "completed" && prev === "delivering" && room.order_flow === "delivery") {
    await pushDeliveryCompletedPair(sb, room, "buyer");
    return;
  }
  const line = systemChatLineForOrderStatus(next, room.order_flow);
  if (!line) return;
  await insertOrderChatMessage(sb, {
    room,
    senderType: "system",
    senderId: null,
    senderName: room.store_name || "시스템",
    messageType: "system",
    content: line,
    relatedOrderStatus: next,
    incrementUnreadFor: "buyer",
  });
}

function isMissingOrderChatRelationError(err: unknown): boolean {
  const e = err as { code?: string; message?: string };
  const m = String(e?.message ?? "").toLowerCase();
  return e?.code === "42P01" || (m.includes("relation") && m.includes("does not exist"));
}

/**
 * 매장 주문 채팅(`order_chat_*`) — `chat_rooms` 일괄 읽음과 별도 파이프라인이므로
 * `POST /api/me/chats/mark-all-read` 에서 함께 호출해 배지·목록 정합을 맞춘다.
 */
export async function markAllOrderChatsReadForUser(
  sb: SupabaseClient<any>,
  userId: string
): Promise<{ ok: true } | { ok: false; error: string }> {
  const uid = String(userId).trim();
  if (!uid) return { ok: false, error: "missing_user" };
  const now = nowIso();

  const rb = await sb.from("order_chat_rooms").update({ unread_count_buyer: 0, updated_at: now }).eq("buyer_user_id", uid);
  if (rb.error && !isMissingOrderChatRelationError(rb.error)) {
    return { ok: false, error: rb.error.message };
  }

  const ro = await sb.from("order_chat_rooms").update({ unread_count_owner: 0, updated_at: now }).eq("owner_user_id", uid);
  if (ro.error && !isMissingOrderChatRelationError(ro.error)) {
    return { ok: false, error: ro.error.message };
  }

  const rp = await sb
    .from("order_chat_participants")
    .update({ unread_count: 0, last_read_at: now, updated_at: now })
    .eq("user_id", uid);
  if (rp.error && !isMissingOrderChatRelationError(rp.error)) {
    return { ok: false, error: rp.error.message };
  }

  const { data: buyerRooms, error: buyerSelErr } = await sb.from("order_chat_rooms").select("id").eq("buyer_user_id", uid);
  if (buyerSelErr && !isMissingOrderChatRelationError(buyerSelErr)) {
    return { ok: false, error: buyerSelErr.message };
  }
  const buyerIds = [...new Set((buyerRooms ?? []).map((r: { id?: string }) => String(r.id ?? "").trim()).filter(Boolean))];
  for (const ids of chunkIds(buyerIds, CHAT_ROOM_ID_IN_CHUNK_SIZE)) {
    const mb = await sb
      .from("order_chat_messages")
      .update({ is_read_by_buyer: true })
      .in("room_id", ids)
      .eq("is_read_by_buyer", false);
    if (mb.error && !isMissingOrderChatRelationError(mb.error)) {
      return { ok: false, error: mb.error.message };
    }
  }

  const { data: ownerRooms, error: ownerSelErr } = await sb.from("order_chat_rooms").select("id").eq("owner_user_id", uid);
  if (ownerSelErr && !isMissingOrderChatRelationError(ownerSelErr)) {
    return { ok: false, error: ownerSelErr.message };
  }
  const ownerIds = [...new Set((ownerRooms ?? []).map((r: { id?: string }) => String(r.id ?? "").trim()).filter(Boolean))];
  for (const ids of chunkIds(ownerIds, CHAT_ROOM_ID_IN_CHUNK_SIZE)) {
    const mo = await sb
      .from("order_chat_messages")
      .update({ is_read_by_owner: true })
      .in("room_id", ids)
      .eq("is_read_by_owner", false);
    if (mo.error && !isMissingOrderChatRelationError(mo.error)) {
      return { ok: false, error: mo.error.message };
    }
  }

  return { ok: true };
}
