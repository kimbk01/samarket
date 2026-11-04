/**
 * 매장 주문 프로세스 — 레거시 이름 호환 (계산은 모두 `store-order-process-model.ts` 4단계 정본).
 * 정본: docs/audit/store-order-process-terms-unify-design-2026-11-04.md §3
 */

import type { AppLanguageCode } from "@/lib/i18n/config";
import { getRuntimeAppLanguage } from "@/lib/i18n/runtime-app-language";
import {
  labelForOwnerTransitionFromModel,
  orderStagePosition,
  processFlowStepStates,
} from "@/lib/stores/store-order-process-model";

export {
  buyerOrderStatusLabel,
  buyerOrderTimelineDeliveryStepLabels,
  buyerOrderTimelinePickupStepLabels,
} from "@/lib/stores/buyer-order-status-labels";

import { buyerOrderStatusLabel as resolveBuyerOrderStatusLabel } from "@/lib/stores/buyer-order-status-labels";

/** 사장님·비즈 콘솔: 현재 상태 → 다음 상태로 보낼 때 버튼 문구 */
export function labelForOwnerTransition(
  current: string,
  next: string,
  fulfillment: string,
  lang: AppLanguageCode = getRuntimeAppLanguage()
): string {
  return labelForOwnerTransitionFromModel(lang, current, next, fulfillment);
}

/** 단계 위치 — 0 접수 대기 · 1~3 진행 칸 · 4 완료 · -1 터미널 */
export function storeOrderTimelineCurrentStep(fulfillmentType: string, orderStatus: string): number {
  return orderStagePosition(orderStatus, fulfillmentType);
}

export type BuyerDetailStepState = "done" | "current" | "upcoming" | "na";

/** 주문 상세·채팅 — 4칸 상태 (이름은 호환용으로 남김) */
export function buyerDetailSixStepStates(fulfillmentType: string, orderStatus: string): BuyerDetailStepState[] {
  return processFlowStepStates(fulfillmentType, orderStatus);
}

/**
 * 레거시 `BUYER_ORDER_STATUS_LABEL[status]` 호환 — 런타임 언어 기준.
 */
export const BUYER_ORDER_STATUS_LABEL: Record<string, string> = new Proxy(
  {} as Record<string, string>,
  {
    get(_target, prop: string | symbol) {
      if (typeof prop !== "string") return undefined;
      return resolveBuyerOrderStatusLabel(prop);
    },
  }
);

export {
  isStoreOrderTerminalStatus,
  ownerNextAction,
  processFlowStepStates,
  processStepIndex,
  processSteps,
  processStatusLabel,
  processStepLabel,
  STORE_ORDER_TERMINAL_STATUSES,
} from "@/lib/stores/store-order-process-model";
