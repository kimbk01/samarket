import { DEMO_ADMIN_USER_ID } from "@/lib/shared-notifications/constants";
import type { SharedNotificationType } from "@/lib/shared-notifications/types";
import { appendOrderNotificationDrafts } from "@/lib/shared-notifications/shared-notification-store";
import type { SharedOrder } from "@/lib/shared-orders/types";

const PREF_CHAT = "allow_order_status" as const;
const PREF_ADMIN = "allow_admin_notice" as const;

export function notifyChatMessageFromMember(order: SharedOrder, preview: string): void {
  appendOrderNotificationDrafts([
    {
      role: "owner",
      target_user_id: order.owner_user_id,
      target_store_id: order.store_id,
      linked_order_id: order.id,
      type: "chat_message",
      title: "새 메시지",
      message: `고객이 새 메시지를 보냈어요: ${preview.slice(0, 120)}`,
      preference: PREF_CHAT,
    },
  ]);
}

export function notifyChatMessageFromOwner(order: SharedOrder, preview: string): void {
  appendOrderNotificationDrafts([
    {
      role: "member",
      target_user_id: order.buyer_user_id,
      target_store_id: null,
      linked_order_id: order.id,
      type: "chat_message",
      title: "새 메시지",
      message: `매장에서 새 메시지를 보냈어요: ${preview.slice(0, 120)}`,
      preference: PREF_CHAT,
    },
  ]);
}

export function notifyAdminChatMessages(order: SharedOrder, preview: string): void {
  const body = `관리자 메시지가 도착했어요: ${preview.slice(0, 100)}`;
  appendOrderNotificationDrafts([
    {
      role: "member",
      target_user_id: order.buyer_user_id,
      target_store_id: null,
      linked_order_id: order.id,
      type: "admin_chat_message",
      title: "관리자 메시지",
      message: body,
      preference: PREF_ADMIN,
      priority: "high",
    },
    {
      role: "owner",
      target_user_id: order.owner_user_id,
      target_store_id: order.store_id,
      linked_order_id: order.id,
      type: "admin_chat_message",
      title: "관리자 메시지",
      message: body,
      preference: PREF_ADMIN,
      priority: "high",
    },
  ]);
}

export function notifyOrderSystemChatLine(order: SharedOrder, line: string): void {
  appendOrderNotificationDrafts([
    {
      role: "member",
      target_user_id: order.buyer_user_id,
      target_store_id: null,
      linked_order_id: order.id,
      type: "order_system_message",
      title: "주문 상태",
      message: line,
      preference: PREF_CHAT,
    },
    {
      role: "owner",
      target_user_id: order.owner_user_id,
      target_store_id: order.store_id,
      linked_order_id: order.id,
      type: "order_system_message",
      title: "주문 상태",
      message: line,
      preference: PREF_CHAT,
    },
    {
      role: "admin",
      target_user_id: DEMO_ADMIN_USER_ID,
      target_store_id: null,
      linked_order_id: order.id,
      type: "order_system_message",
      title: "주문 채팅",
      message: `${order.order_no}: ${line}`,
      preference: PREF_CHAT,
    },
  ]);
}

export function notifyChatRoomBlocked(order: SharedOrder, blocked: boolean): void {
  const type: SharedNotificationType = blocked ? "chat_blocked" : "chat_unblocked";
  const title = blocked ? "채팅 제한" : "채팅 해제";
  const body = blocked
    ? "관리자에 의해 이 주문 채팅이 일시 중단되었어요"
    : "주문 채팅을 다시 이용할 수 있어요";
  appendOrderNotificationDrafts([
    {
      role: "member",
      target_user_id: order.buyer_user_id,
      target_store_id: null,
      linked_order_id: order.id,
      type,
      title,
      message: body,
      preference: PREF_ADMIN,
      priority: "high",
    },
    {
      role: "owner",
      target_user_id: order.owner_user_id,
      target_store_id: order.store_id,
      linked_order_id: order.id,
      type,
      title,
      message: body,
      preference: PREF_ADMIN,
      priority: "high",
    },
    {
      role: "admin",
      target_user_id: DEMO_ADMIN_USER_ID,
      target_store_id: null,
      linked_order_id: order.id,
      type,
      title,
      message: `${order.order_no}: ${body}`,
      preference: PREF_ADMIN,
    },
  ]);
}

export function notifyAdminInterventionRoom(order: SharedOrder): void {
  appendOrderNotificationDrafts([
    {
      role: "member",
      target_user_id: order.buyer_user_id,
      target_store_id: null,
      linked_order_id: order.id,
      type: "admin_chat_message",
      title: "관리자 개입",
      message: "관리자가 이 주문 채팅을 확인 중이에요",
      preference: PREF_ADMIN,
    },
    {
      role: "owner",
      target_user_id: order.owner_user_id,
      target_store_id: order.store_id,
      linked_order_id: order.id,
      type: "admin_chat_message",
      title: "관리자 개입",
      message: "관리자가 이 주문 채팅을 확인 중이에요",
      preference: PREF_ADMIN,
    },
  ]);
}
