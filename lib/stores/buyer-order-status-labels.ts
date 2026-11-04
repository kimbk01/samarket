import type { AppLanguageCode } from "@/lib/i18n/config";
import { getRuntimeAppLanguage } from "@/lib/i18n/runtime-app-language";
import {
  normalizeStoreOrderCancelKind,
  orderStageNames,
  orderStatusName,
} from "@/lib/stores/store-order-process-model";

/** 주문 상태 이름 — `store-order-process-model` 4단계 정본 위임 (사장님·손님·채팅·알림 같은 이름) */
export function buyerOrderStatusLabel(
  status: string,
  lang: AppLanguageCode = getRuntimeAppLanguage(),
  fulfillment: string = "local_delivery",
  /** `store_orders.cancel_kind` 원값 — 「rejected」면 「주문 거절」 */
  cancelKind?: unknown
): string {
  return orderStatusName(status.trim(), fulfillment, lang, normalizeStoreOrderCancelKind(cancelKind));
}

/** 배달 4칸 이름 — 주문접수 · 조리중 · 배달중 · 배달완료 */
export function buyerOrderTimelineDeliveryStepLabels(
  lang: AppLanguageCode = getRuntimeAppLanguage(),
  fulfillment: string = "local_delivery"
): readonly string[] {
  return orderStageNames(fulfillment, lang);
}

/** 픽업 4칸 이름 — 주문접수 · 조리중 · 픽업대기 · 픽업완료 */
export function buyerOrderTimelinePickupStepLabels(
  lang: AppLanguageCode = getRuntimeAppLanguage(),
  fulfillment: string = "pickup"
): readonly string[] {
  return orderStageNames(fulfillment, lang);
}
