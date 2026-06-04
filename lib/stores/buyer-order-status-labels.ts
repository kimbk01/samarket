import type { AppLanguageCode } from "@/lib/i18n/config";
import { getRuntimeAppLanguage } from "@/lib/i18n/runtime-app-language";
import {
  processStatusLabel,
  processStepLabel,
  type StoreOrderProcessStepKey,
} from "@/lib/stores/store-order-process-model";

const BUYER_DETAIL_DELIVERY_KEYS: readonly StoreOrderProcessStepKey[] = [
  "pending",
  "accepted",
  "preparing",
  "ready_for_pickup",
  "delivering",
  "arrived",
];

const BUYER_DETAIL_PICKUP_KEYS: readonly StoreOrderProcessStepKey[] = [
  "pending",
  "accepted",
  "preparing",
  "ready_for_pickup",
];

/** 구매자·채팅·알림용 주문 상태 라벨 — `store-order-process-model` 위임 (터미널·진행 공통) */
export function buyerOrderStatusLabel(
  status: string,
  lang: AppLanguageCode = getRuntimeAppLanguage(),
  fulfillment: string = "local_delivery"
): string {
  return processStatusLabel(status.trim(), fulfillment, "buyer", lang);
}

/** 배달·택배 타임라인 6단계 라벨 */
export function buyerOrderTimelineDeliveryStepLabels(
  lang: AppLanguageCode = getRuntimeAppLanguage(),
  fulfillment: string = "local_delivery"
): readonly string[] {
  return BUYER_DETAIL_DELIVERY_KEYS.map((key) => processStepLabel(key, fulfillment, "buyer", lang));
}

/** 픽업·포장 타임라인 4단계 라벨 */
export function buyerOrderTimelinePickupStepLabels(
  lang: AppLanguageCode = getRuntimeAppLanguage(),
  fulfillment: string = "pickup"
): readonly string[] {
  return BUYER_DETAIL_PICKUP_KEYS.map((key) => processStepLabel(key, fulfillment, "buyer", lang));
}
