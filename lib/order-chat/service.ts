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
  const { data } = await sb.from("order_chat_rooms").select("*").eq("order_id", orderId).maybeSingle();
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
    .select("*")
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
  return data as OrderChatMessagePublic;
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
  const { data: roomData, error: roomErr } = await sb.from("order_chat_rooms").insert(roomInsert).select("*").single();
  if (roomErr || !roomData) {
    console.error("[order-chat] insert room", roomErr);
    return { ok: false, error: roomErr?.message ?? "room_insert_failed" };
  }
  const room = roomData as OrderChatRoomPublic;
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
  userId: string
): Promise<{ ok: true; snapshot: OrderChatSnapshot } | { ok: false; error: string; status: number }> {
  const match = await getOrderWithRoomForUser(sb, orderId, userId);
  if (!match) return { ok: false, error: "forbidden", status: 403 };
  const { data } = await sb
    .from("order_chat_messages")
    .select("*")
    .eq("room_id", match.room.id)
    .order("created_at", { ascending: true });
  return {
    ok: true,
    snapshot: {
      room: match.room,
      role: match.role,
      orderStatus: match.orderStatus,
      messages: (data ?? []) as OrderChatMessagePublic[],
    },
  };
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
