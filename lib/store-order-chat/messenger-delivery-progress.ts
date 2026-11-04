import type { AppLanguageCode } from "@/lib/i18n/config";
import { getRuntimeAppLanguage } from "@/lib/i18n/runtime-app-language";
import { orderStageNames, orderStagePosition } from "@/lib/stores/store-order-process-model";

/**
 * 주문 채팅 위 진행 표시 — 4단계 정본 (주문접수 · 조리중 · 배달중|픽업대기 · 배달완료|픽업완료).
 * 사장님 주문 카드·손님 상세와 같은 칸 (Owner 2026-11-04 · 설계안 v2 §3-1).
 */
export function messengerDeliveryProgressSteps(
  fulfillmentType: string,
  lang: AppLanguageCode = getRuntimeAppLanguage()
): readonly string[] {
  return orderStageNames(fulfillmentType, lang);
}

/** 강조할 칸 (0..3) — 접수 대기·취소·요청 = -1 (강조 없음), 완료 = 3 */
export function messengerDeliveryProgressCurrentStep(orderStatus: string, fulfillmentType: string): number {
  const pos = orderStagePosition(orderStatus.trim() || "pending", fulfillmentType);
  if (pos <= 0) return -1;
  return Math.min(3, pos - 1);
}

/** 진행 바 채움 비율(0~1) — 칸 위치 / 4 (완료 = 1, 접수 대기·취소 = 0) */
export function messengerDeliveryProgressFillRatio(orderStatus: string, fulfillmentType: string): number {
  const pos = orderStagePosition(orderStatus.trim() || "pending", fulfillmentType);
  if (pos <= 0) return 0;
  return Math.min(1, pos / 4);
}
