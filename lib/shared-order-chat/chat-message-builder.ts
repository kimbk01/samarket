import { DEFAULT_APP_LANGUAGE, type AppLanguageCode } from "@/lib/i18n/config";
import { translateText } from "@/lib/i18n/messages";
import type { SharedOrderStatus } from "@/lib/shared-orders/types";

/** 배달/픽업에 따라 시스템 안내 톤을 나눕니다. */
export type OrderChatFlow = "delivery" | "pickup";

/** 배달 주문: 배송지 도착 단계 시스템 줄 */
export const SYSTEM_LINE_DELIVERY_ARRIVED = "배송지에 도착했어요.";

/** 배달 주문: 주문완료 시스템 줄 */
export const SYSTEM_LINE_DELIVERY_DONE = "주문이 완료되었어요. 맛있게 드세요!";

/**
 * 채팅방 시스템 메시지.
 * 배달: `arrived`·`completed` 각각 한 줄씩 삽입 (appendStoreOrderChatStatusTransition).
 */
export function systemChatLineForOrderStatus(
  status: SharedOrderStatus,
  flow: OrderChatFlow = "pickup",
  language: AppLanguageCode = DEFAULT_APP_LANGUAGE
): string | null {
  let line: string | null;
  switch (status) {
    case "pending":
      line = "매장에서 주문을 확인하고 있어요";
      break;
    case "accepted":
      line = "주문이 확인되었어요";
      break;
    case "preparing":
      line = "음식을 준비하고 있어요.";
      break;
    case "delivering":
      if (flow !== "delivery") return null;
      line = "배달이 시작되었습니다.";
      break;
    case "ready_for_pickup":
      line = flow === "delivery"
        ? "음식 준비가 완료되었습니다."
        : "음식 준비가 완료되었습니다.";
      break;
    case "arrived":
      if (flow !== "delivery") return null;
      line = SYSTEM_LINE_DELIVERY_ARRIVED;
      break;
    case "completed":
      line = flow === "delivery" ? "배달이 완료되었습니다." : "주문이 완료되었습니다.";
      break;
    case "cancel_requested":
      line = "취소 요청이 접수되었어요.";
      break;
    case "cancelled":
      line = "주문이 취소되었습니다.";
      break;
    case "refund_requested":
      line = "환불 요청이 접수되었어요.";
      break;
    case "refunded":
      line = "환불이 처리되었어요.";
      break;
    default:
      return null;
  }
  return language === DEFAULT_APP_LANGUAGE ? line : translateText(language, line);
}
