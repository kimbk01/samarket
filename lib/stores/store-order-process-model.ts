/**
 * 매장·구매자·채팅 — 주문 프로세스 단일 파생 원천.
 * DO NOT: `order_status` 해석을 UI·채팅 파일에 따로 정의하지 말 것.
 */
import type { AppLanguageCode } from "@/lib/i18n/config";
import { translate, type MessageKey } from "@/lib/i18n/messages";
import { getRuntimeAppLanguage } from "@/lib/i18n/runtime-app-language";
import {
  allowedOrderTransitions,
  isDeliveryFulfillment,
  STORE_ORDER_STATUS_LIST,
} from "@/lib/stores/order-status-transitions";
import type { OrderChatFlow } from "@/lib/shared-order-chat/chat-message-builder";
import type { SharedOrderStatus } from "@/lib/shared-orders/types";
import {
  buyerDetailSixStepStates,
  storeOrderTimelineCurrentStep,
  type BuyerDetailStepState,
} from "@/lib/stores/store-order-process-criteria";

export type StoreOrderProcessStepKey =
  | "pending"
  | "accepted"
  | "preparing"
  | "ready_for_pickup"
  | "delivering"
  | "arrived"
  | "completed";

export type StoreOrderProcessAudience = "owner" | "buyer" | "owner_badge";

export type StoreOrderFlowStepState = "done" | "current" | "upcoming";

const DELIVERY_STEP_KEYS: readonly StoreOrderProcessStepKey[] = [
  "pending",
  "accepted",
  "preparing",
  "ready_for_pickup",
  "delivering",
  "arrived",
  "completed",
];

const PICKUP_STEP_KEYS: readonly StoreOrderProcessStepKey[] = [
  "pending",
  "accepted",
  "preparing",
  "ready_for_pickup",
  "completed",
];

/** 터미널·이슈 상태 — 진행바 7/4칸 대신 단일 표시 */
export const STORE_ORDER_TERMINAL_STATUSES = new Set([
  "cancelled",
  "cancel_requested",
  "refund_requested",
  "refunded",
]);

export function isStoreOrderTerminalStatus(orderStatus: string): boolean {
  return STORE_ORDER_TERMINAL_STATUSES.has(orderStatus.trim());
}

export function processSteps(fulfillment: string): readonly StoreOrderProcessStepKey[] {
  return isDeliveryFulfillment(fulfillment) ? DELIVERY_STEP_KEYS : PICKUP_STEP_KEYS;
}

export function processStepIndex(orderStatus: string, fulfillment: string): number {
  return storeOrderTimelineCurrentStep(fulfillment, orderStatus);
}

/** 구매자 상세 6열(배달) / 픽업 4+2열 — 기존 `buyerDetailSixStepStates` 계약 유지 */
export function processBuyerDetailStepStates(
  fulfillment: string,
  orderStatus: string
): BuyerDetailStepState[] {
  return buyerDetailSixStepStates(fulfillment, orderStatus);
}

/** 오너·채팅 요약 — `processSteps` 길이와 1:1 */
export function processFlowStepStates(
  fulfillment: string,
  orderStatus: string
): StoreOrderFlowStepState[] {
  const keys = processSteps(fulfillment);
  if (STORE_ORDER_TERMINAL_STATUSES.has(orderStatus)) {
    return keys.map(() => "upcoming" as const);
  }
  const idx = keys.indexOf(orderStatus as StoreOrderProcessStepKey);
  const current = idx >= 0 ? idx : -1;
  return keys.map((_, i) => {
    if (current < 0) return "upcoming";
    if (i < current) return "done";
    if (i === current) return "current";
    return "upcoming";
  });
}

function orderChatFlow(fulfillment: string): OrderChatFlow {
  return isDeliveryFulfillment(fulfillment) ? "delivery" : "pickup";
}

function statusToShared(orderStatus: string): SharedOrderStatus | null {
  const s = orderStatus.trim();
  const allowed: SharedOrderStatus[] = [
    "pending",
    "accepted",
    "preparing",
    "ready_for_pickup",
    "delivering",
    "arrived",
    "completed",
    "cancel_requested",
    "cancelled",
    "refund_requested",
    "refunded",
  ];
  return (allowed as string[]).includes(s) ? (s as SharedOrderStatus) : null;
}

const OWNER_STEP_LABEL_KEYS: Record<
  StoreOrderProcessStepKey,
  { delivery: MessageKey; pickup: MessageKey }
> = {
  pending: { delivery: "store_owner_ops_flow_new", pickup: "store_owner_ops_flow_new" },
  accepted: { delivery: "store_owner_ops_flow_accepted", pickup: "store_owner_ops_flow_accepted" },
  preparing: { delivery: "store_owner_ops_flow_cooking", pickup: "store_owner_ops_flow_cooking" },
  ready_for_pickup: {
    delivery: "store_owner_ops_flow_delivery_ready",
    pickup: "store_owner_ops_flow_pickup_ready",
  },
  delivering: { delivery: "store_owner_ops_flow_delivering", pickup: "store_owner_ops_flow_delivering" },
  arrived: { delivery: "store_owner_ops_flow_near_address", pickup: "store_owner_ops_flow_near_address" },
  completed: { delivery: "store_owner_ops_flow_done", pickup: "store_owner_ops_flow_pickup_done" },
};

const BUYER_STEP_LABEL_KEYS: Record<
  StoreOrderProcessStepKey,
  { delivery: MessageKey; pickup: MessageKey }
> = {
  pending: { delivery: "mypage_comp_order_status_pending", pickup: "mypage_comp_order_status_pending" },
  accepted: { delivery: "mypage_comp_order_status_accepted", pickup: "mypage_comp_order_status_accepted" },
  preparing: { delivery: "mypage_comp_order_status_preparing", pickup: "mypage_comp_order_status_preparing" },
  ready_for_pickup: {
    delivery: "store_order_process_step_ready_dispatch",
    pickup: "mypage_comp_order_status_ready_for_pickup",
  },
  delivering: { delivery: "mypage_comp_order_status_delivering", pickup: "mypage_comp_order_status_delivering" },
  arrived: { delivery: "mypage_comp_order_status_arrived", pickup: "mypage_comp_order_status_arrived" },
  completed: { delivery: "mypage_comp_order_status_completed", pickup: "mypage_comp_order_status_completed" },
};

const OWNER_BADGE_STATUS_KEYS: Partial<Record<string, MessageKey>> = {
  pending: "store_owner_status_pending",
  accepted: "store_owner_status_accepted",
  preparing: "store_owner_status_preparing",
  delivering: "store_owner_status_delivering",
  arrived: "store_owner_status_arrived",
  cancel_requested: "store_owner_status_cancel_requested",
  cancelled: "store_owner_status_cancelled",
  refund_requested: "store_owner_status_refund_requested",
  refunded: "store_owner_status_refunded",
};

const BUYER_EXTRA_STATUS_KEYS: Partial<Record<string, MessageKey>> = {
  cancelled: "mypage_comp_order_status_cancelled",
  refund_requested: "mypage_comp_order_status_refund_requested",
  refunded: "mypage_comp_order_status_refunded",
  cancel_requested: "mypage_comp_order_status_cancel_requested",
};

function readyForPickupBadgeKey(fulfillment: string): MessageKey {
  return isDeliveryFulfillment(fulfillment)
    ? "store_owner_ops_status_ready_delivery"
    : "store_owner_ops_status_ready_pickup";
}

function completedBadgeKey(fulfillment: string): MessageKey {
  return isDeliveryFulfillment(fulfillment)
    ? "store_owner_ops_status_completed_delivery"
    : "store_owner_ops_status_completed_pickup";
}

export function processStepLabel(
  stepKey: StoreOrderProcessStepKey,
  fulfillment: string,
  audience: StoreOrderProcessAudience,
  lang: AppLanguageCode = getRuntimeAppLanguage()
): string {
  const deliveryLike = isDeliveryFulfillment(fulfillment);
  if (audience === "owner" || audience === "owner_badge") {
    const row = OWNER_STEP_LABEL_KEYS[stepKey];
    const key = deliveryLike ? row.delivery : row.pickup;
    return translate(lang, key);
  }
  const row = BUYER_STEP_LABEL_KEYS[stepKey];
  const key = deliveryLike ? row.delivery : row.pickup;
  return translate(lang, key);
}

export function processStatusLabel(
  orderStatus: string,
  fulfillment: string,
  audience: StoreOrderProcessAudience,
  lang: AppLanguageCode = getRuntimeAppLanguage()
): string {
  const status = orderStatus.trim();
  if (audience === "owner_badge") {
    if (status === "ready_for_pickup") return translate(lang, readyForPickupBadgeKey(fulfillment));
    if (status === "completed") return translate(lang, completedBadgeKey(fulfillment));
    const key = OWNER_BADGE_STATUS_KEYS[status];
    return key ? translate(lang, key) : status;
  }
  if (audience === "owner") {
    const idx = processSteps(fulfillment).indexOf(status as StoreOrderProcessStepKey);
    if (idx >= 0) {
      return processStepLabel(status as StoreOrderProcessStepKey, fulfillment, "owner", lang);
    }
    const key = OWNER_BADGE_STATUS_KEYS[status];
    return key ? translate(lang, key) : status;
  }
  const extraKey = BUYER_EXTRA_STATUS_KEYS[status];
  if (extraKey) return translate(lang, extraKey);
  const idx = processSteps(fulfillment).indexOf(status as StoreOrderProcessStepKey);
  if (idx >= 0) {
    return processStepLabel(status as StoreOrderProcessStepKey, fulfillment, "buyer", lang);
  }
  return status;
}

export type OwnerNextAction = { status: string; label: string } | null;

const TRANSITION_NEXT_KEYS: Partial<Record<string, MessageKey>> = {
  accepted: "store_owner_transition_accepted",
  preparing: "store_owner_transition_preparing",
  ready_for_pickup: "store_owner_transition_ready",
  delivering: "store_owner_transition_delivering",
  arrived: "store_owner_transition_arrived",
  completed: "store_owner_transition_completed",
};

export function labelForOwnerTransitionFromModel(
  lang: AppLanguageCode,
  current: string,
  next: string,
  _fulfillment: string
): string {
  if (next === "cancelled") {
    return translate(
      lang,
      current === "pending" ? "store_owner_action_reject_order" : "store_owner_action_cancel_order"
    );
  }
  const key = TRANSITION_NEXT_KEYS[next];
  return key ? translate(lang, key) : next;
}

export function ownerNextAction(
  orderStatus: string,
  fulfillment: string,
  lang: AppLanguageCode = getRuntimeAppLanguage()
): OwnerNextAction {
  const allowed = allowedOrderTransitions(orderStatus, fulfillment).filter((s) => s !== "cancelled");
  const next = allowed[0];
  if (!next) return null;
  return {
    status: next,
    label: labelForOwnerTransitionFromModel(lang, orderStatus, next, fulfillment),
  };
}

/** 채팅 system INSERT·표시 — `store_delivery_ops_body_*` / `cm_sys_*` 단일 매핑 */
export function chatMessageKey(
  orderStatus: string,
  fulfillment: string
): MessageKey | null {
  const shared = statusToShared(orderStatus);
  if (!shared) return null;
  const flow = orderChatFlow(fulfillment);
  switch (shared) {
    case "pending":
      return "cm_sys_order_pending";
    case "accepted":
      return "store_delivery_ops_body_accepted";
    case "preparing":
      return "store_delivery_ops_body_preparing";
    case "ready_for_pickup":
      return flow === "delivery" ? "store_delivery_ops_body_ready_delivery" : "store_delivery_ops_body_ready_pickup";
    case "delivering":
      return "store_delivery_ops_body_delivering";
    case "arrived":
      return flow === "delivery" ? "cm_sys_order_arrived" : null;
    case "completed":
      return flow === "delivery"
        ? "store_delivery_ops_body_completed_delivery"
        : "store_delivery_ops_body_completed_pickup";
    case "cancel_requested":
      return "cm_sys_order_cancel_requested";
    case "cancelled":
      return "cm_sys_order_cancelled";
    case "refund_requested":
      return "cm_sys_order_refund_requested";
    case "refunded":
      return "cm_sys_order_refunded";
    default:
      return null;
  }
}

export function chatMessageKeyWithPrep(
  orderStatus: string,
  fulfillment: string,
  prepMinutes?: number
): MessageKey | null {
  if (orderStatus === "accepted" && prepMinutes != null && prepMinutes > 0) {
    return "store_delivery_ops_body_accepted_prep";
  }
  return chatMessageKey(orderStatus, fulfillment);
}

/** contract·회귀 검사용 */
export {
  STORE_ORDER_STATUS_LIST,
  buyerDetailSixStepStates,
  storeOrderTimelineCurrentStep,
  processFlowStepStates as processStepStates,
};
