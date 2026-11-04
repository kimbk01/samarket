import type { AppLanguageCode } from "@/lib/i18n/config";
import { getRuntimeAppLanguage } from "@/lib/i18n/runtime-app-language";
import { allowedOrderTransitions } from "@/lib/stores/order-status-transitions";
import {
  orderStageNames,
  orderStagePosition,
  ownerNextAction,
  processFlowStepStates,
} from "@/lib/stores/store-order-process-model";
import { ownerOrderStepConfirmMessageI18n } from "@/lib/stores/owner-order-ui-labels";
import type { BuyerDetailStepState } from "@/lib/stores/store-order-process-criteria";

/** 상세 보기 시 신규 주문 자동 접수 — `OwnerOrderAcceptSheet` 프리셋과 동일 기본값 */
export const OWNER_AUTO_ACCEPT_PREP_MINUTES = 30;

/** 오너 카드·버튼 — 취소 제외 다음 DB 상태 */
export function ownerOrderForwardTransition(current: string, fulfillment: string): string | null {
  const allowed = allowedOrderTransitions(current, fulfillment).filter((s) => s !== "cancelled");
  return allowed[0] ?? null;
}

export type OwnerNextOrderAction = {
  status: string;
  label: string;
};

export function resolveOwnerNextOrderAction(
  current: string,
  fulfillment: string,
  lang: AppLanguageCode = getRuntimeAppLanguage()
): OwnerNextOrderAction | null {
  return ownerNextAction(current, fulfillment, lang);
}

export type OwnerOrderCardStepperModel = {
  /** 4칸 — 지난 단계 done · 지금 단계 current · 남은 단계 upcoming (정본 `processFlowStepStates`) */
  visual: BuyerDetailStepState[];
  /** 다음 버튼이 들어가는 칸 (0 주문접수 · 1 조리중 · 2 배달중/픽업대기 · 3 완료) */
  actionableIndex: number | null;
};

/**
 * 사장님 주문 카드 4칸 (Owner 2026-11-04 · 설계안 v2 §3-2).
 * 칸 이름은 항상 단계 이름(주문접수·조리중·배달중|픽업대기·배달완료|픽업완료)이고, 버튼 이름은 `ownerNextAction`.
 */
export function ownerOrderCardStepperModel(
  fulfillmentType: string,
  orderStatus: string
): OwnerOrderCardStepperModel {
  const visual = processFlowStepStates(fulfillmentType, orderStatus) as BuyerDetailStepState[];
  if (!ownerOrderForwardTransition(orderStatus, fulfillmentType)) {
    return { visual, actionableIndex: null };
  }
  const pos = orderStagePosition(orderStatus, fulfillmentType);
  return { visual, actionableIndex: pos >= 0 && pos <= 3 ? pos : null };
}

/** @deprecated 주문 카드는 `ownerOrderCardStepperModel` 사용 */
export function ownerOrderStepperVisualStates(fulfillmentType: string, orderStatus: string): BuyerDetailStepState[] {
  return ownerOrderCardStepperModel(fulfillmentType, orderStatus).visual;
}

export function ownerOrderActionableStepIndex(orderStatus: string, fulfillmentType: string): number | null {
  return ownerOrderCardStepperModel(fulfillmentType, orderStatus).actionableIndex;
}

/** 4칸 이름 — 단계 이름 그대로 (칸 이름을 버튼 이름으로 바꾸지 않는다) */
export function ownerOrderCardStepColumnLabel(
  stepIndex: number,
  _orderStatus: string,
  fulfillmentType: string,
  _actionableIndex: number | null,
  lang: AppLanguageCode = getRuntimeAppLanguage()
): string {
  return orderStageNames(fulfillmentType, lang)[stepIndex] ?? "";
}

export type OwnerStepperClickAction =
  | { kind: "accept_sheet" }
  | { kind: "confirm"; nextStatus: string; message: string; stepLabel: string };

export function ownerOrderStepConfirmMessage(
  buyerLabel: string,
  nextStatus: string,
  fulfillment: string,
  lang: AppLanguageCode = getRuntimeAppLanguage()
): string {
  return ownerOrderStepConfirmMessageI18n(lang, buyerLabel, nextStatus, fulfillment);
}

export function resolveOwnerStepperClickAction(
  orderStatus: string,
  fulfillmentType: string,
  clickedStepIndex: number,
  buyerLabel: string,
  lang: AppLanguageCode = getRuntimeAppLanguage()
): OwnerStepperClickAction | null {
  const { actionableIndex } = ownerOrderCardStepperModel(fulfillmentType, orderStatus);
  if (actionableIndex == null || clickedStepIndex !== actionableIndex) return null;
  if (orderStatus === "pending") return { kind: "accept_sheet" };
  const next = ownerNextAction(orderStatus, fulfillmentType, lang);
  if (!next) return null;
  return {
    kind: "confirm",
    nextStatus: next.status,
    message: ownerOrderStepConfirmMessage(buyerLabel, next.status, fulfillmentType, lang),
    stepLabel: next.label,
  };
}
