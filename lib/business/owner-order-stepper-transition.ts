import { allowedOrderTransitions, isDeliveryFulfillment } from "@/lib/stores/order-status-transitions";
import {
  TIMELINE_DELIVERY_STEPS,
  TIMELINE_PICKUP_STEPS,
} from "@/lib/stores/store-order-process-criteria";
import type { BuyerDetailStepState } from "@/lib/stores/store-order-process-criteria";

/** 상세 보기 시 신규 주문 자동 접수 — `OwnerOrderAcceptSheet` 프리셋과 동일 기본값 */
export const OWNER_AUTO_ACCEPT_PREP_MINUTES = 30;

const U: BuyerDetailStepState = "upcoming";
const D: BuyerDetailStepState = "done";
const C: BuyerDetailStepState = "current";

/** 오너 카드·버튼 — 취소 제외 다음 DB 상태 (배달: delivering→completed 우선) */
export function ownerOrderForwardTransition(current: string, fulfillment: string): string | null {
  const allowed = allowedOrderTransitions(current, fulfillment).filter((s) => s !== "cancelled");
  return allowed[0] ?? null;
}

export type OwnerOrderCardStepperModel = {
  /** 4열 — done / current(깜빡임=다음에 선택할 단계) / upcoming */
  visual: BuyerDetailStepState[];
  /** 탭·깜빡임 열 (다음 진행) */
  actionableIndex: number | null;
};

/** 다음 선택 열 = `current`(깜빡임), 그 앞은 `done` */
function visualForNextActionColumn(actionableIndex: number | null): BuyerDetailStepState[] {
  if (actionableIndex == null) return [U, U, U, U];
  return [0, 1, 2, 3].map((i) => {
    if (i < actionableIndex) return D;
    if (i === actionableIndex) return C;
    return U;
  }) as BuyerDetailStepState[];
}

/**
 * 주문 관리 카드 — 다음에 누를 열 인덱스.
 * 0 주문접수 · 1 준비(조리)중 · 2 배달중|픽업대기 · 3 완료
 */
function ownerOrderActionableColumnIndex(
  orderStatus: string,
  fulfillmentType: string
): number | null {
  if (!ownerOrderForwardTransition(orderStatus, fulfillmentType)) return null;
  const deliveryLike = isDeliveryFulfillment(fulfillmentType);

  if (deliveryLike) {
    switch (orderStatus) {
      case "pending":
        return 1;
      case "accepted":
        return 1;
      case "preparing":
      case "ready_for_pickup":
        return 2;
      case "delivering":
      case "arrived":
        return 3;
      default:
        return null;
    }
  }

  switch (orderStatus) {
    case "pending":
      return 1;
    case "accepted":
      return 2;
    case "preparing":
    case "ready_for_pickup":
      return 3;
    default:
      return null;
  }
}

export function ownerOrderCardStepperModel(
  fulfillmentType: string,
  orderStatus: string
): OwnerOrderCardStepperModel {
  const terminal = new Set(["cancelled", "refunded", "refund_requested", "completed"]);
  if (terminal.has(orderStatus)) {
    return {
      visual: orderStatus === "completed" ? [D, D, D, D] : [U, U, U, U],
      actionableIndex: null,
    };
  }

  const actionableIndex = ownerOrderActionableColumnIndex(orderStatus, fulfillmentType);
  return {
    visual: visualForNextActionColumn(actionableIndex),
    actionableIndex,
  };
}

/**
 * @deprecated 주문 카드는 `ownerOrderCardStepperModel` 사용
 */
export function ownerOrderStepperVisualStates(
  fulfillmentType: string,
  orderStatus: string
): BuyerDetailStepState[] {
  return ownerOrderCardStepperModel(fulfillmentType, orderStatus).visual;
}

export function ownerOrderActionableStepIndex(
  orderStatus: string,
  fulfillmentType: string
): number | null {
  return ownerOrderCardStepperModel(fulfillmentType, orderStatus).actionableIndex;
}

/** 스테퍼 열 표시 문구 — 다음 액션 열은 실제 전이에 맞는 라벨 */
export function ownerOrderCardStepColumnLabel(
  stepIndex: number,
  orderStatus: string,
  fulfillmentType: string,
  actionableIndex: number | null
): string {
  const deliveryLike = isDeliveryFulfillment(fulfillmentType);
  const steps = deliveryLike ? TIMELINE_DELIVERY_STEPS : TIMELINE_PICKUP_STEPS;
  const base = steps[stepIndex] ?? "";
  if (actionableIndex !== stepIndex) return base;

  const next = ownerOrderForwardTransition(orderStatus, fulfillmentType);
  if (!next) return base;

  if (orderStatus === "pending" && stepIndex === 1) return steps[1] ?? base;

  switch (next) {
    case "preparing":
      return "준비(조리) 시작";
    case "ready_for_pickup":
      return deliveryLike ? "준비 완료" : (steps[2] ?? "픽업대기");
    case "delivering":
      return "배달 시작";
    case "arrived":
      return "배송지 도착";
    case "completed":
      return deliveryLike ? "배달완료" : "픽업완료";
    default:
      return base;
  }
}

export type OwnerStepperClickAction =
  | { kind: "accept_sheet" }
  | { kind: "confirm"; nextStatus: string; message: string; stepLabel: string };

export function ownerOrderStepConfirmMessage(
  buyerLabel: string,
  nextStatus: string,
  fulfillment: string
): string {
  const who = buyerLabel.trim() || "주문자";
  const deliveryLike = isDeliveryFulfillment(fulfillment);
  switch (nextStatus) {
    case "accepted":
      return `${who}님의 주문을 접수합니다.`;
    case "preparing":
      return `${who}님의 주문을 준비(조리) 처리합니다.`;
    case "ready_for_pickup":
      return deliveryLike
        ? `${who}님의 주문 준비를 완료하고 배달을 준비합니다.`
        : `${who}님의 주문 준비를 완료하고 픽업 대기로 전환합니다.`;
    case "delivering":
      return `${who}님의 주문 배달을 시작합니다.`;
    case "arrived":
      return `${who}님의 주문이 배송지에 도착했습니다.`;
    case "completed":
      return deliveryLike
        ? `${who}님의 주문을 배달 완료 처리합니다.`
        : `${who}님의 주문을 픽업 완료 처리합니다.`;
    default:
      return `${who}님의 주문 상태를 변경합니다.`;
  }
}

function stepLabelForNext(nextStatus: string, fulfillment: string): string {
  const deliveryLike = isDeliveryFulfillment(fulfillment);
  const steps = deliveryLike ? TIMELINE_DELIVERY_STEPS : TIMELINE_PICKUP_STEPS;
  if (nextStatus === "accepted" || nextStatus === "preparing") return steps[1] ?? "준비(조리)중";
  if (nextStatus === "ready_for_pickup") return deliveryLike ? "준비 완료" : (steps[2] ?? "픽업대기");
  if (nextStatus === "delivering") return "배달 시작";
  if (nextStatus === "arrived") return "배송지 도착";
  if (nextStatus === "completed") return steps[3] ?? "배달완료";
  return nextStatus;
}

export function resolveOwnerStepperClickAction(
  orderStatus: string,
  fulfillmentType: string,
  clickedStepIndex: number,
  buyerLabel: string
): OwnerStepperClickAction | null {
  const terminal = new Set(["cancelled", "refunded", "refund_requested", "completed"]);
  if (terminal.has(orderStatus)) return null;

  const { actionableIndex } = ownerOrderCardStepperModel(fulfillmentType, orderStatus);
  if (actionableIndex == null || clickedStepIndex !== actionableIndex) return null;

  if (orderStatus === "pending") {
    return { kind: "accept_sheet" };
  }

  const next = ownerOrderForwardTransition(orderStatus, fulfillmentType);
  if (!next) return null;

  return {
    kind: "confirm",
    nextStatus: next,
    message: ownerOrderStepConfirmMessage(buyerLabel, next, fulfillmentType),
    stepLabel: stepLabelForNext(next, fulfillmentType),
  };
}
