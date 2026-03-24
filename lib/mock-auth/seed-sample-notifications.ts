import { appendOrderNotificationDrafts } from "@/lib/shared-notifications/shared-notification-store";
import { SHARED_SIM_STORE_ID } from "@/lib/shared-orders/types";
import {
  SAMPLE_ADMIN_USER_ID,
  SAMPLE_MEMBER_USER_ID,
  SAMPLE_OWNER_USER_ID,
} from "./mock-users";

const FLAG_KEY = "kasama-sample-notifications-seeded-v1";

/**
 * 한 번만: 검증용 알림 몇 건을 적재 (주문 sh-1001 기준).
 * 실제 Auth 연동 후에는 제거하거나 서버 시드로 대체.
 */
export function ensureSampleNotificationsSeededOnce(): void {
  if (typeof window === "undefined") return;
  try {
    if (sessionStorage.getItem(FLAG_KEY)) return;
    sessionStorage.setItem(FLAG_KEY, "1");
  } catch {
    return;
  }

  const oid = "sh-1001";
  appendOrderNotificationDrafts([
    {
      role: "member",
      target_user_id: SAMPLE_MEMBER_USER_ID,
      target_store_id: null,
      linked_order_id: oid,
      type: "order_accepted",
      title: "주문 알림",
      message: "매장에서 주문을 확인했어요",
      preference: "allow_order_status",
    },
    {
      role: "member",
      target_user_id: SAMPLE_MEMBER_USER_ID,
      target_store_id: null,
      linked_order_id: oid,
      type: "preparing",
      title: "주문 알림",
      message: "음식을 준비하고 있어요",
      preference: "allow_order_status",
    },
    {
      role: "member",
      target_user_id: SAMPLE_MEMBER_USER_ID,
      target_store_id: null,
      linked_order_id: oid,
      type: "delivering",
      title: "주문 알림",
      message: "배달이 출발했어요",
      preference: "allow_order_status",
    },
    {
      role: "member",
      target_user_id: SAMPLE_MEMBER_USER_ID,
      target_store_id: null,
      linked_order_id: oid,
      type: "cancel_requested",
      title: "주문 알림",
      message: "취소 요청이 접수되었어요",
      preference: "allow_cancel",
    },
    {
      role: "member",
      target_user_id: SAMPLE_MEMBER_USER_ID,
      target_store_id: null,
      linked_order_id: oid,
      type: "refunded",
      title: "주문 알림",
      message: "환불이 승인되었어요",
      preference: "allow_refund",
    },
    {
      role: "member",
      target_user_id: SAMPLE_MEMBER_USER_ID,
      target_store_id: null,
      linked_order_id: oid,
      type: "chat_message",
      title: "채팅",
      message: "매장에서 새 메시지를 보냈어요: 안내 드립니다",
      preference: "allow_order_status",
    },
    {
      role: "owner",
      target_user_id: SAMPLE_OWNER_USER_ID,
      target_store_id: SHARED_SIM_STORE_ID,
      linked_order_id: oid,
      type: "new_order",
      title: "새 주문",
      message: "새 주문이 들어왔어요",
      preference: "allow_new_order",
    },
    {
      role: "owner",
      target_user_id: SAMPLE_OWNER_USER_ID,
      target_store_id: SHARED_SIM_STORE_ID,
      linked_order_id: oid,
      type: "cancel_requested",
      title: "취소 요청",
      message: "고객이 취소를 요청했어요",
      preference: "allow_cancel",
    },
    {
      role: "owner",
      target_user_id: SAMPLE_OWNER_USER_ID,
      target_store_id: SHARED_SIM_STORE_ID,
      linked_order_id: oid,
      type: "chat_message",
      title: "채팅",
      message: "고객이 새 메시지를 보냈어요: 문의입니다",
      preference: "allow_order_status",
    },
    {
      role: "owner",
      target_user_id: SAMPLE_OWNER_USER_ID,
      target_store_id: SHARED_SIM_STORE_ID,
      linked_order_id: oid,
      type: "settlement_held",
      title: "정산",
      message: "정산이 보류되었어요",
      preference: "allow_settlement",
      priority: "high",
    },
    {
      role: "owner",
      target_user_id: SAMPLE_OWNER_USER_ID,
      target_store_id: SHARED_SIM_STORE_ID,
      linked_order_id: oid,
      type: "admin_chat_message",
      title: "관리자",
      message: "관리자 메시지가 도착했어요: 확인 부탁드립니다",
      preference: "allow_admin_notice",
      priority: "high",
    },
    {
      role: "admin",
      target_user_id: SAMPLE_ADMIN_USER_ID,
      target_store_id: null,
      linked_order_id: oid,
      type: "cancel_requested",
      title: "운영",
      message: "취소 요청 주문이 발생했어요",
      preference: "allow_cancel",
      priority: "high",
    },
    {
      role: "admin",
      target_user_id: SAMPLE_ADMIN_USER_ID,
      target_store_id: null,
      linked_order_id: oid,
      type: "refund_requested",
      title: "운영",
      message: "환불 요청 주문이 발생했어요",
      preference: "allow_refund",
      priority: "high",
    },
    {
      role: "admin",
      target_user_id: SAMPLE_ADMIN_USER_ID,
      target_store_id: null,
      linked_order_id: oid,
      type: "dispute",
      title: "채팅",
      message: "신고된 주문 채팅이 있어요",
      preference: "allow_admin_notice",
      priority: "high",
    },
    {
      role: "admin",
      target_user_id: SAMPLE_ADMIN_USER_ID,
      target_store_id: null,
      linked_order_id: oid,
      type: "settlement_held",
      title: "정산",
      message: "정산 보류가 필요한 주문이 생겼어요",
      preference: "allow_settlement",
      priority: "high",
    },
  ]);
}
