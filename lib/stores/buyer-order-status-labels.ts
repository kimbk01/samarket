import type { AppLanguageCode } from "@/lib/i18n/config";
import { translate, type MessageKey } from "@/lib/i18n/messages";
import { getRuntimeAppLanguage } from "@/lib/i18n/runtime-app-language";

const BUYER_ORDER_STATUS_KEYS: Record<string, MessageKey> = {
  pending: "mypage_comp_order_status_pending",
  accepted: "mypage_comp_order_status_accepted",
  preparing: "mypage_comp_order_status_preparing",
  ready_for_pickup: "mypage_comp_order_status_ready_for_pickup",
  delivering: "mypage_comp_order_status_delivering",
  arrived: "mypage_comp_order_status_arrived",
  completed: "mypage_comp_order_status_completed",
  cancelled: "mypage_comp_order_status_cancelled",
  refund_requested: "mypage_comp_order_status_refund_requested",
  refunded: "mypage_comp_order_status_refunded",
  cancel_requested: "mypage_comp_order_status_cancel_requested",
};

/** 구매자·채팅·알림용 주문 상태 라벨 (단일 카탈로그: `mypage_comp_order_status_*`) */
export function buyerOrderStatusLabel(
  status: string,
  lang: AppLanguageCode = getRuntimeAppLanguage()
): string {
  const key = BUYER_ORDER_STATUS_KEYS[status];
  return key ? translate(lang, key) : status;
}

/** 배달·택배 타임라인 6단계 라벨 */
export function buyerOrderTimelineDeliveryStepLabels(
  lang: AppLanguageCode = getRuntimeAppLanguage()
): readonly string[] {
  return [
    buyerOrderStatusLabel("pending", lang),
    buyerOrderStatusLabel("accepted", lang),
    buyerOrderStatusLabel("preparing", lang),
    buyerOrderStatusLabel("ready_for_pickup", lang),
    buyerOrderStatusLabel("delivering", lang),
    buyerOrderStatusLabel("arrived", lang),
  ] as const;
}

/** 픽업·포장 타임라인 4단계 라벨 */
export function buyerOrderTimelinePickupStepLabels(
  lang: AppLanguageCode = getRuntimeAppLanguage()
): readonly string[] {
  return [
    buyerOrderStatusLabel("pending", lang),
    buyerOrderStatusLabel("accepted", lang),
    buyerOrderStatusLabel("preparing", lang),
    buyerOrderStatusLabel("ready_for_pickup", lang),
  ] as const;
}
