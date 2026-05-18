import { DEFAULT_APP_LANGUAGE, type AppLanguageCode } from "@/lib/i18n/config";
import { translate, type MessageKey } from "@/lib/i18n/messages";
import type { SharedOrderStatus } from "@/lib/shared-orders/types";

/** 배달/픽업에 따라 시스템 안내 톤을 나눕니다. */
export type OrderChatFlow = "delivery" | "pickup";

/** @deprecated `systemChatLineForOrderStatus("arrived", "delivery")` 사용 */
export const SYSTEM_LINE_DELIVERY_ARRIVED = translate(DEFAULT_APP_LANGUAGE, "cm_sys_order_arrived");

/** @deprecated `systemChatLineForOrderStatus("completed", "delivery")` 사용 */
export const SYSTEM_LINE_DELIVERY_DONE = translate(DEFAULT_APP_LANGUAGE, "cm_sys_order_completed_delivery");

function statusMessageKey(status: SharedOrderStatus, flow: OrderChatFlow): MessageKey | null {
  switch (status) {
    case "pending":
      return "cm_sys_order_pending";
    case "accepted":
      return "cm_sys_order_accepted";
    case "preparing":
      return flow === "delivery" ? "cm_sys_order_preparing_delivery" : "cm_sys_order_preparing_pickup";
    case "delivering":
      return flow === "delivery" ? "cm_sys_order_delivering" : null;
    case "ready_for_pickup":
      return flow === "delivery" ? "cm_sys_order_ready_delivery" : "cm_sys_order_ready_pickup";
    case "arrived":
      return flow === "delivery" ? "cm_sys_order_arrived" : null;
    case "completed":
      return flow === "delivery" ? "cm_sys_order_completed_delivery" : "cm_sys_order_completed_pickup";
    case "cancel_requested":
      return "cm_sys_order_cancel_requested";
    case "cancelled":
      return "cm_sys_order_cancelled";
    case "refund_requested":
      return "cm_sys_order_refund_requested";
    case "refunded":
      return "cm_sys_order_refunded";
    default:
      return null;
  }
}

/**
 * 채팅방 시스템 메시지.
 * 배달: `arrived`·`completed` 각각 한 줄씩 삽입 (appendStoreOrderChatStatusTransition).
 */
export function systemChatLineForOrderStatus(
  status: SharedOrderStatus,
  flow: OrderChatFlow = "pickup",
  language: AppLanguageCode = DEFAULT_APP_LANGUAGE
): string | null {
  const key = statusMessageKey(status, flow);
  if (!key) return null;
  return translate(language, key);
}
