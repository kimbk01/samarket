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
      line = "주문이 접수되었어요.";
      break;
    case "accepted":
      line = "📋 주문 확인이 완료되었습니다. 추가로 필요하신 사항이 있으시면 말씀해 주세요.";
      break;
    case "preparing":
      line = flow === "delivery"
        ? "상품을 준비 중입니다. 곧 배송을 시작할 예정이에요."
        : "상품을 준비 중입니다.";
      break;
    case "delivering":
      if (flow !== "delivery") return null;
      line = "배송을 시작합니다. 기사님이 고객님 계신 곳으로 이동 중이에요. (소요 시간은 교통·날씨에 따라 달라질 수 있어요.)";
      break;
    case "ready_for_pickup":
      line = flow === "delivery"
        ? "상품 픽업·출고 준비가 되었습니다. 곧 배송을 시작합니다."
        : "지금 매장에서 픽업하실 수 있어요. 방문 시 주문 번호를 알려 주세요.";
      break;
    case "arrived":
      if (flow !== "delivery") return null;
      line = SYSTEM_LINE_DELIVERY_ARRIVED;
      break;
    case "completed":
      line = flow === "delivery" ? SYSTEM_LINE_DELIVERY_DONE : "주문이 완료되었어요. 이용해 주셔서 감사합니다!";
      break;
    case "cancel_requested":
      line = "취소 요청이 접수되었어요.";
      break;
    case "cancelled":
      line = "주문이 취소되었어요.";
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
