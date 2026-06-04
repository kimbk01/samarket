/**
 * 매장 주문 프로세스 (사마켓: 앱 내 결제 없음 — 금액 수납은 고객·매장 직접 정산)
 *
 * - DB: store_orders.order_status 중심. payment_status 는 금액 확정·정산 호환용 메타에 가깝게 둠.
 * - 신규 파생 API: `lib/stores/store-order-process-model.ts` (단계·CTA·채팅 key).
 * - 구매자 화면 상태 문구: `buyerOrderStatusLabel` (`lib/stores/buyer-order-status-labels.ts`).
 */

import type { AppLanguageCode } from "@/lib/i18n/config";
import { getRuntimeAppLanguage } from "@/lib/i18n/runtime-app-language";
import { isDeliveryFulfillment } from "@/lib/stores/order-status-transitions";
import { labelForOwnerTransitionI18n } from "@/lib/stores/owner-order-ui-labels";

export {
  buyerOrderStatusLabel,
  buyerOrderTimelineDeliveryStepLabels,
  buyerOrderTimelinePickupStepLabels,
} from "@/lib/stores/buyer-order-status-labels";

import {
  buyerOrderStatusLabel as resolveBuyerOrderStatusLabel,
  buyerOrderTimelineDeliveryStepLabels,
  buyerOrderTimelinePickupStepLabels,
} from "@/lib/stores/buyer-order-status-labels";

/**
 * 사장님·비즈 콘솔: 현재 상태 → 다음 상태로 보낼 때 버튼 문구
 */
export function labelForOwnerTransition(
  current: string,
  next: string,
  fulfillment: string,
  lang: AppLanguageCode = getRuntimeAppLanguage()
): string {
  return labelForOwnerTransitionI18n(lang, current, next, fulfillment);
}

/**
 * 현재 진행 중인 타임라인 단계 인덱스 (0..n). completed면 n(=단계 수)과 같게 두고 UI에서 전체 완료 처리.
 * 배달 6열: pending … arrived → 인덱스 0..5, completed=6.
 * 픽업 4열: pending … ready_for_pickup → 인덱스 0..3, completed=4.
 */
export function storeOrderTimelineCurrentStep(fulfillmentType: string, orderStatus: string): number {
  const deliveryLike = isDeliveryFulfillment(fulfillmentType);
  if (deliveryLike) {
    const m: Record<string, number> = {
      pending: 0,
      accepted: 1,
      preparing: 2,
      ready_for_pickup: 3,
      delivering: 4,
      arrived: 5,
      completed: 6,
    };
    return m[orderStatus] ?? 0;
  }
  const m: Record<string, number> = {
    pending: 0,
    accepted: 1,
    preparing: 2,
    ready_for_pickup: 3,
    completed: 4,
  };
  return m[orderStatus] ?? 0;
}

export type BuyerDetailStepState = "done" | "current" | "upcoming" | "na";

/** 주문 상세용 6단계 — 픽업·포장은 배송 단계(3,4)를 생략 행으로 표시 */
export function buyerDetailSixStepStates(
  fulfillmentType: string,
  orderStatus: string
): BuyerDetailStepState[] {
  const deliveryLike = isDeliveryFulfillment(fulfillmentType);
  const na: BuyerDetailStepState = "na";
  const u: BuyerDetailStepState = "upcoming";
  const d: BuyerDetailStepState = "done";
  const c: BuyerDetailStepState = "current";

  if (
    ["cancelled", "cancel_requested", "refund_requested", "refunded"].includes(orderStatus)
  ) {
    return [u, u, u, na, na, u];
  }

  if (deliveryLike) {
    switch (orderStatus) {
      case "pending":
        return [c, u, u, u, u, u];
      case "accepted":
        return [d, c, u, u, u, u];
      case "preparing":
        return [d, d, c, u, u, u];
      case "ready_for_pickup":
        return [d, d, d, c, u, u];
      case "delivering":
        return [d, d, d, d, c, u];
      case "arrived":
        return [d, d, d, d, d, c];
      case "completed":
        return [d, d, d, d, d, d];
      default:
        return [u, u, u, u, u, u];
    }
  }

  switch (orderStatus) {
    case "pending":
      return [c, u, u, na, na, u];
    case "accepted":
      return [d, c, u, na, na, u];
    case "preparing":
      return [d, d, c, na, na, u];
    case "ready_for_pickup":
      return [d, d, d, na, na, c];
    case "completed":
      return [d, d, d, na, na, d];
    default:
      return [u, u, u, na, na, u];
  }
}

/**
 * 레거시 `BUYER_ORDER_STATUS_LABEL[status]` 호환 — 런타임 언어 기준.
 * 신규 코드는 `buyerOrderStatusLabel(status, lang)` 사용.
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
