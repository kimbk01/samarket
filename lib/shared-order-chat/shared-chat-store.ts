/**
 * 주문 전용 in-memory 채팅 스토어.
 * 거래(DM) 채팅의 `KASAMA_TRADE_CHAT_UNREAD_UPDATED` 이벤트·`/api/chat/*`와 데이터·갱신 경로를 섞지 않습니다.
 */
import type { SharedOrder, SharedOrderStatus } from "@/lib/shared-orders/types";
import { storeOrderStatusToShared } from "@/lib/store-commerce/map-order-status";
import { SAMPLE_ADMIN_DISPLAY, SAMPLE_ADMIN_USER_ID } from "@/lib/mock-auth/mock-users";
import {
  notifyAdminChatMessages,
  notifyChatMessageFromMember,
  notifyChatMessageFromOwner,
  notifyChatRoomBlocked,
  notifyOrderSystemChatLine,
} from "./chat-notifications";
import type { OrderChatFlow } from "./chat-message-builder";
import {
  SYSTEM_LINE_DELIVERY_ARRIVED,
  SYSTEM_LINE_DELIVERY_DONE,
  systemChatLineForOrderStatus,
} from "./chat-message-builder";
import type { OrderChatMessage, OrderChatMessageType, OrderChatRoom, OrderChatRoomStatus, OrderChatSenderType } from "./types";

function clone<T>(x: T): T {
  return JSON.parse(JSON.stringify(x)) as T;
}

let rooms: OrderChatRoom[] = [];
let messages: OrderChatMessage[] = [];
let version = 0;
const listeners = new Set<() => void>();

export function subscribeOrderChat(cb: () => void) {
  listeners.add(cb);
  return () => listeners.delete(cb);
}

export function getOrderChatVersion() {
  return version;
}

function bump() {
  version++;
  listeners.forEach((l) => l());
}

function nowIso() {
  return new Date().toISOString();
}

function roomOrderFlow(room: OrderChatRoom): OrderChatFlow {
  return room.order_flow === "delivery" ? "delivery" : "pickup";
}

function notifyStubFromRoom(room: OrderChatRoom, orderStatus: SharedOrderStatus): SharedOrder {
  const order_type = roomOrderFlow(room) === "delivery" ? "delivery" : "pickup";
  return {
    id: room.order_id,
    order_no: room.order_no,
    store_id: room.store_id,
    store_name: room.store_name,
    store_slug: "",
    owner_user_id: room.owner_user_id,
    owner_name: room.owner_name,
    buyer_user_id: room.buyer_user_id,
    buyer_name: room.buyer_name,
    buyer_phone: "",
    order_type,
    order_status: orderStatus,
    payment_status: "pending",
    settlement_status: "scheduled",
    admin_action_status: "none",
    product_amount: 0,
    option_amount: 0,
    delivery_fee: 0,
    discount_amount: 0,
    total_amount: 0,
    final_amount: 0,
    request_message: null,
    delivery_address_summary: null,
    delivery_address_detail: null,
    pickup_note: null,
    cancel_request_reason: null,
    cancel_request_status: "none",
    cancel_reason: null,
    refund_reason: null,
    refund_request: null,
    admin_memo: "",
    has_report: false,
    dispute_memo: null,
    settlement: null,
    items: [],
    logs: [],
    created_at: room.created_at,
    updated_at: room.updated_at,
  } as SharedOrder;
}

function newMsgId() {
  return `ocm-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`;
}

export function resetSharedOrderChat() {
  rooms = [];
  messages = [];
  bump();
}

export function findOrderChatRoomByOrderId(orderId: string): OrderChatRoom | undefined {
  const r = rooms.find((x) => x.order_id === orderId);
  return r ? clone(r) : undefined;
}

export function listOrderChatRooms(): OrderChatRoom[] {
  return rooms.map(clone);
}

export function listOrderChatRoomsForBuyer(buyerUserId: string | null): OrderChatRoom[] {
  if (!buyerUserId) return [];
  return rooms
    .filter((r) => r.buyer_user_id === buyerUserId)
    .map(clone)
    .sort((a, b) => new Date(b.last_message_at).getTime() - new Date(a.last_message_at).getTime());
}

export function listOrderChatRoomsForOwner(ownerUserId: string | null, storeId: string): OrderChatRoom[] {
  if (!ownerUserId) return [];
  return rooms
    .filter((r) => r.owner_user_id === ownerUserId && r.store_id === storeId)
    .map(clone)
    .sort((a, b) => new Date(b.last_message_at).getTime() - new Date(a.last_message_at).getTime());
}

export function listMessagesForRoom(roomId: string): OrderChatMessage[] {
  return messages.filter((m) => m.room_id === roomId).map(clone);
}

export function listMessagesForOrder(orderId: string): OrderChatMessage[] {
  const r = rooms.find((x) => x.order_id === orderId);
  if (!r) return [];
  return listMessagesForRoom(r.id);
}

function touchRoom(r: OrderChatRoom) {
  r.updated_at = nowIso();
}

function recomputeRoomUnread(roomId: string) {
  const r = rooms.find((x) => x.id === roomId);
  if (!r) return;
  const ms = messages.filter((m) => m.room_id === roomId);
  r.unread_count_member = ms.filter((m) => !m.is_read_by_member && m.sender_type !== "member").length;
  r.unread_count_owner = ms.filter((m) => !m.is_read_by_owner && m.sender_type !== "owner").length;
  r.unread_count_admin = ms.filter((m) => !m.is_read_by_admin && m.sender_type !== "admin").length;
}

function pushMessage(
  room: OrderChatRoom,
  p: {
    sender_type: OrderChatSenderType;
    sender_id: string;
    sender_name: string;
    message_type: OrderChatMessageType;
    content: string;
    image_url: string | null;
    related_order_status: SharedOrderStatus | null;
  }
): OrderChatMessage {
  const msg: OrderChatMessage = {
    id: newMsgId(),
    room_id: room.id,
    order_id: room.order_id,
    ...p,
    is_read_by_member: p.sender_type === "member",
    is_read_by_owner: p.sender_type === "owner",
    is_read_by_admin: p.sender_type === "admin",
    created_at: nowIso(),
  };
  if (p.sender_type === "system") {
    msg.is_read_by_member = false;
    msg.is_read_by_owner = false;
    msg.is_read_by_admin = false;
  }
  messages.push(msg);
  room.last_message = p.content.slice(0, 200);
  room.last_message_at = msg.created_at;
  recomputeRoomUnread(room.id);
  touchRoom(room);
  bump();
  return msg;
}

function inferLastChatOrderStatusFromMessages(roomId: string): SharedOrderStatus | null {
  const ms = messages
    .filter((m) => m.room_id === roomId && m.related_order_status)
    .sort((a, b) => a.created_at.localeCompare(b.created_at));
  const last = ms[ms.length - 1];
  return last?.related_order_status ?? null;
}

const TERMINAL_ORDER_CHAT_STATUSES: SharedOrderStatus[] = [
  "cancel_requested",
  "cancelled",
  "refund_requested",
  "refunded",
];

function happyPathStatuses(flow: OrderChatFlow): SharedOrderStatus[] {
  return flow === "delivery"
    ? ["pending", "accepted", "preparing", "ready_for_pickup", "delivering", "arrived", "completed"]
    : ["pending", "accepted", "preparing", "ready_for_pickup", "completed"];
}

function computeNextOrderChatStatus(
  cur: SharedOrderStatus | null,
  target: SharedOrderStatus,
  flow: OrderChatFlow
): SharedOrderStatus | null {
  if (target === cur) return null;
  if (TERMINAL_ORDER_CHAT_STATUSES.includes(target)) {
    return target;
  }

  const chain = happyPathStatuses(flow);
  let idxCur = cur == null ? -1 : chain.indexOf(cur);
  const idxTgt = chain.indexOf(target);
  if (idxTgt < 0) return null;

  if (idxCur < 0 && cur != null) {
    if (cur === "ready_for_pickup" && flow === "delivery") idxCur = chain.indexOf("ready_for_pickup");
    else if (cur === "delivering" && flow === "pickup") idxCur = chain.indexOf("preparing");
    else idxCur = -1;
  }

  if (idxCur >= idxTgt) return null;

  return chain[idxCur + 1] ?? null;
}

/**
 * 서버 스냅샷 주문 상태가 채팅 방(`last_chat_order_status`)보다 앞서 있으면
 * 시스템 메시지를 한 단계씩만 추가합니다. (뒤로 가기·재진입 시 중복 방지 + 누락 보정)
 */
export function reconcileOrderChatRoomWithSharedOrder(o: SharedOrder): void {
  const room = rooms.find((r) => r.order_id === o.id);
  if (!room) return;

  const flow: OrderChatFlow = o.order_type === "delivery" ? "delivery" : "pickup";
  room.order_flow = room.order_flow ?? flow;

  if (room.last_chat_order_status == null) {
    room.last_chat_order_status = inferLastChatOrderStatusFromMessages(room.id) ?? "pending";
  }

  const target = o.order_status;
  let guard = 0;
  while (room.last_chat_order_status !== target && guard++ < 24) {
    const cur = room.last_chat_order_status;
    const next = computeNextOrderChatStatus(cur, target, flow);
    if (next == null) break;
    syncOrderChatRoomOrderStatus({ ...o, order_status: next }, cur);
  }
}

export function ensureOrderChatRoom(
  o: SharedOrder,
  opts?: { skipReconcile?: boolean }
): OrderChatRoom {
  const skipReconcile = opts?.skipReconcile === true;
  const flow: OrderChatFlow = o.order_type === "delivery" ? "delivery" : "pickup";
  let room = rooms.find((r) => r.order_id === o.id);
  if (room) {
    room.order_flow = room.order_flow ?? flow;
    if (!skipReconcile) reconcileOrderChatRoomWithSharedOrder(o);
    return room;
  }

  const id = `ocr-${o.id}`;
  room = {
    id,
    order_id: o.id,
    order_no: o.order_no,
    store_id: o.store_id,
    store_name: o.store_name,
    buyer_user_id: o.buyer_user_id,
    buyer_name: o.buyer_name,
    owner_user_id: o.owner_user_id,
    owner_name: o.owner_name,
    order_flow: flow,
    room_status: "active",
    last_message: "",
    last_message_at: nowIso(),
    unread_count_member: 0,
    unread_count_owner: 0,
    unread_count_admin: 0,
    last_chat_order_status: null,
    created_at: nowIso(),
    updated_at: nowIso(),
  };
  rooms.push(room);

  const line = systemChatLineForOrderStatus(o.order_status, flow);
  if (line) {
    pushMessage(room, {
      sender_type: "system",
      sender_id: "system",
      sender_name: "시스템",
      message_type: "system",
      content: line,
      image_url: null,
      related_order_status: o.order_status,
    });
    room.last_chat_order_status = o.order_status;
  }
  touchRoom(room);
  if (!skipReconcile) reconcileOrderChatRoomWithSharedOrder(o);
  return room;
}

export function syncOrderChatRoomOrderStatus(order: SharedOrder, previousStatus: SharedOrderStatus | null): void {
  const room = ensureOrderChatRoom(order, { skipReconcile: true });
  const flow: OrderChatFlow = order.order_type === "delivery" ? "delivery" : "pickup";
  room.order_flow = room.order_flow ?? flow;

  if (previousStatus === null) {
    return;
  }
  if (room.last_chat_order_status === order.order_status) {
    return;
  }

  const prev = previousStatus;
  const next = order.order_status;

  if (next === "completed" && prev === "delivering" && flow === "delivery") {
    pushMessage(room, {
      sender_type: "system",
      sender_id: "system",
      sender_name: "시스템",
      message_type: "system",
      content: SYSTEM_LINE_DELIVERY_ARRIVED,
      image_url: null,
      related_order_status: "delivering",
    });
    notifyOrderSystemChatLine(order, SYSTEM_LINE_DELIVERY_ARRIVED);
    pushMessage(room, {
      sender_type: "system",
      sender_id: "system",
      sender_name: "시스템",
      message_type: "system",
      content: SYSTEM_LINE_DELIVERY_DONE,
      image_url: null,
      related_order_status: "completed",
    });
    notifyOrderSystemChatLine(order, SYSTEM_LINE_DELIVERY_DONE);
    room.last_chat_order_status = next;
    touchRoom(room);
    return;
  }

  const line = systemChatLineForOrderStatus(next, flow);
  if (line) {
    pushMessage(room, {
      sender_type: "system",
      sender_id: "system",
      sender_name: "시스템",
      message_type: "system",
      content: line,
      image_url: null,
      related_order_status: next,
    });
    notifyOrderSystemChatLine(order, line);
  }
  room.last_chat_order_status = next;
  touchRoom(room);
}

/**
 * 실매장 DB 주문 상태 변경 시 — 이미 열린 주문 채팅방에 시스템 줄 추가.
 * `reconcileOrderChatRoomWithSharedOrder`와 동일한 다단계 보정(배달 완료 2줄 등)을 씁니다.
 */
export function syncStoreCommerceOrderChatByDbStatus(
  orderId: string,
  _previousDbStatus: string,
  nextDbStatus: string
): void {
  const next = storeOrderStatusToShared(nextDbStatus);
  if (!next) return;
  const room = rooms.find((r) => r.order_id === orderId);
  if (!room) return;
  const stub = notifyStubFromRoom(room, next);
  reconcileOrderChatRoomWithSharedOrder(stub);
}

export function getOrderChatUnreadForMember(orderId: string, buyerUserId: string | null): number {
  if (!buyerUserId) return 0;
  const r = rooms.find((x) => x.order_id === orderId && x.buyer_user_id === buyerUserId);
  return r?.unread_count_member ?? 0;
}

export function getOrderChatUnreadForOwner(orderId: string, ownerUserId: string | null, storeId: string): number {
  if (!ownerUserId) return 0;
  const r = rooms.find(
    (x) => x.order_id === orderId && x.owner_user_id === ownerUserId && x.store_id === storeId
  );
  return r?.unread_count_owner ?? 0;
}

export function markOrderChatReadAsMember(orderId: string, buyerUserId: string | null): void {
  if (!buyerUserId) return;
  const r = rooms.find((x) => x.order_id === orderId && x.buyer_user_id === buyerUserId);
  if (!r) return;
  let changed = false;
  for (const m of messages) {
    if (m.room_id !== r.id) continue;
    if (!m.is_read_by_member) {
      m.is_read_by_member = true;
      changed = true;
    }
  }
  if (!changed) return;
  recomputeRoomUnread(r.id);
  touchRoom(r);
  bump();
}

export function markOrderChatReadAsOwner(orderId: string, ownerUserId: string | null, storeId: string): void {
  if (!ownerUserId) return;
  const r = rooms.find(
    (x) => x.order_id === orderId && x.owner_user_id === ownerUserId && x.store_id === storeId
  );
  if (!r) return;
  let changed = false;
  for (const m of messages) {
    if (m.room_id !== r.id) continue;
    if (!m.is_read_by_owner) {
      m.is_read_by_owner = true;
      changed = true;
    }
  }
  if (!changed) return;
  recomputeRoomUnread(r.id);
  touchRoom(r);
  bump();
}

export function markOrderChatReadAsAdmin(orderId: string): void {
  const r = rooms.find((x) => x.order_id === orderId);
  if (!r) return;
  let changed = false;
  for (const m of messages) {
    if (m.room_id !== r.id) continue;
    if (!m.is_read_by_admin) {
      m.is_read_by_admin = true;
      changed = true;
    }
  }
  if (!changed) return;
  recomputeRoomUnread(r.id);
  touchRoom(r);
  bump();
}

function isRoomMessagingBlocked(room: OrderChatRoom): boolean {
  return room.room_status === "blocked";
}

export function sendOrderChatTextFromMember(
  order: SharedOrder,
  buyerUserId: string,
  text: string
): { ok: true } | { ok: false; error: string } {
  if (!text.trim()) return { ok: false, error: "메시지를 입력해 주세요." };
  if (order.buyer_user_id !== buyerUserId) return { ok: false, error: "본인 주문이 아닙니다." };
  const room = ensureOrderChatRoom(order);
  if (isRoomMessagingBlocked(room)) return { ok: false, error: "관리자에 의해 채팅이 중단된 상태예요." };
  pushMessage(room, {
    sender_type: "member",
    sender_id: buyerUserId,
    sender_name: order.buyer_name,
    message_type: "text",
    content: text.trim(),
    image_url: null,
    related_order_status: null,
  });
  notifyChatMessageFromMember(order, text.trim());
  return { ok: true };
}

export function sendOrderChatTextFromOwner(
  order: SharedOrder,
  ownerUserId: string,
  text: string
): { ok: true } | { ok: false; error: string } {
  if (!text.trim()) return { ok: false, error: "메시지를 입력해 주세요." };
  if (order.owner_user_id !== ownerUserId) return { ok: false, error: "권한이 없습니다." };
  const room = ensureOrderChatRoom(order);
  if (isRoomMessagingBlocked(room)) return { ok: false, error: "관리자에 의해 채팅이 중단된 상태예요." };
  pushMessage(room, {
    sender_type: "owner",
    sender_id: ownerUserId,
    sender_name: order.owner_name,
    message_type: "text",
    content: text.trim(),
    image_url: null,
    related_order_status: null,
  });
  notifyChatMessageFromOwner(order, text.trim());
  return { ok: true };
}

export function sendOrderChatFromAdmin(
  order: SharedOrder,
  text: string,
  asSystemNote: boolean
): { ok: true } | { ok: false; error: string } {
  if (!text.trim()) return { ok: false, error: "메시지를 입력해 주세요." };
  const room = ensureOrderChatRoom(order);
  const message_type: OrderChatMessageType = asSystemNote ? "admin_note" : "text";
  pushMessage(room, {
    sender_type: "admin",
    sender_id: SAMPLE_ADMIN_USER_ID,
    sender_name: SAMPLE_ADMIN_DISPLAY,
    message_type,
    content: text.trim(),
    image_url: null,
    related_order_status: null,
  });
  notifyAdminChatMessages(order, text.trim());
  return { ok: true };
}

export function setOrderChatRoomStatus(orderId: string, status: OrderChatRoomStatus): void {
  const r = rooms.find((x) => x.order_id === orderId);
  if (!r) return;
  r.room_status = status;
  touchRoom(r);
  bump();
}

/** 관리자: 채팅 차단/해제 — 회원·오너 전송 막음, 시스템 메시지·알림 발송 */
export function setOrderChatMessagingBlocked(order: SharedOrder, blocked: boolean): void {
  const room = ensureOrderChatRoom(order);
  if (blocked) {
    if (room.room_status === "blocked") return;
    room.room_status = "blocked";
    pushMessage(room, {
      sender_type: "system",
      sender_id: "system",
      sender_name: "시스템",
      message_type: "system",
      content: "관리자에 의해 채팅이 일시 중단되었어요",
      image_url: null,
      related_order_status: null,
    });
    notifyChatRoomBlocked(order, true);
  } else {
    if (room.room_status !== "blocked") return;
    room.room_status = "active";
    pushMessage(room, {
      sender_type: "system",
      sender_id: "system",
      sender_name: "시스템",
      message_type: "system",
      content: "채팅이 다시 활성화되었어요",
      image_url: null,
      related_order_status: null,
    });
    notifyChatRoomBlocked(order, false);
  }
  touchRoom(room);
  bump();
}

export function isOrderChatMessagingBlocked(orderId: string): boolean {
  const r = rooms.find((x) => x.order_id === orderId);
  return r?.room_status === "blocked";
}
