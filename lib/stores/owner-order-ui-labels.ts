import type { AppLanguageCode } from "@/lib/i18n/config";
import { translate, type MessageKey } from "@/lib/i18n/messages";
import { getRuntimeAppLanguage } from "@/lib/i18n/runtime-app-language";
import {
  labelForOwnerTransitionFromModel,
  processStatusLabel,
} from "@/lib/stores/store-order-process-model";
import type { OwnerOrderStatus, OwnerOrderTab } from "@/lib/store-owner/types";

export const OWNER_ORDER_STATUS_KEYS: Record<OwnerOrderStatus, MessageKey> = {
  pending: "store_owner_status_pending",
  accepted: "store_owner_status_accepted",
  preparing: "store_owner_status_preparing",
  ready_for_pickup: "store_owner_status_ready_for_pickup",
  delivering: "store_owner_status_delivering",
  arrived: "store_owner_status_arrived",
  completed: "store_owner_status_completed",
  cancel_requested: "store_owner_status_cancel_requested",
  cancelled: "store_owner_status_cancelled",
  refund_requested: "store_owner_status_refund_requested",
  refunded: "store_owner_status_refunded",
};

export function ownerOrderStatusLabel(
  status: OwnerOrderStatus,
  lang: AppLanguageCode = getRuntimeAppLanguage()
): string {
  return translate(lang, OWNER_ORDER_STATUS_KEYS[status]);
}

export const OWNER_ORDER_TAB_KEYS: Record<OwnerOrderTab, MessageKey> = {
  all: "store_owner_tab_all",
  new: "store_owner_tab_new",
  active: "store_owner_tab_active",
  done: "store_owner_tab_done",
  issue: "store_owner_tab_issue",
};

export function ownerOrderTabLabel(
  tab: OwnerOrderTab,
  lang: AppLanguageCode = getRuntimeAppLanguage()
): string {
  return translate(lang, OWNER_ORDER_TAB_KEYS[tab]);
}

/** 사장님·비즈 콘솔: 현재 상태 → 다음 상태 버튼 문구 — `store-order-process-model` 위임 */
export function labelForOwnerTransitionI18n(
  lang: AppLanguageCode,
  current: string,
  next: string,
  fulfillment: string
): string {
  return labelForOwnerTransitionFromModel(lang, current, next, fulfillment);
}

export function ownerOrderStepConfirmMessageI18n(
  lang: AppLanguageCode,
  buyerLabel: string,
  nextStatus: string,
  fulfillment: string
): string {
  const who = buyerLabel.trim() || translate(lang, "store_owner_confirm_buyer_fallback");
  const deliveryLike = fulfillment === "local_delivery" || fulfillment === "shipping";
  const keyMap: Record<string, MessageKey> = {
    accepted: "store_owner_confirm_accepted",
    preparing: "store_owner_confirm_preparing",
    ready_for_pickup: deliveryLike
      ? "store_owner_confirm_ready_delivery"
      : "store_owner_confirm_ready_pickup",
    delivering: "store_owner_confirm_delivering",
    arrived: "store_owner_confirm_arrived",
    completed: deliveryLike
      ? "store_owner_confirm_completed_delivery"
      : "store_owner_confirm_completed_pickup",
  };
  const key = keyMap[nextStatus] ?? "store_owner_confirm_status_change";
  return translate(lang, key, { who });
}

export function ownerStepLabelForNextI18n(
  lang: AppLanguageCode,
  nextStatus: string,
  fulfillment: string,
  deliverySteps: readonly string[],
  pickupSteps: readonly string[]
): string {
  const deliveryLike = fulfillment === "local_delivery" || fulfillment === "shipping";
  const steps = deliveryLike ? deliverySteps : pickupSteps;
  if (nextStatus === "accepted" || nextStatus === "preparing") {
    return steps[1] ?? translate(lang, "store_owner_step_preparing_short");
  }
  if (nextStatus === "ready_for_pickup") {
    return deliveryLike
      ? translate(lang, "store_owner_step_ready_complete")
      : (steps[2] ?? translate(lang, "store_owner_step_pickup_waiting"));
  }
  if (nextStatus === "delivering") return translate(lang, "store_owner_step_delivery_start");
  if (nextStatus === "arrived") return translate(lang, "store_owner_step_arrived_short");
  if (nextStatus === "completed") {
    return steps[3] ?? translate(lang, "store_owner_step_delivery_done");
  }
  return nextStatus;
}

export function ownerOpsStatusLabelI18n(
  lang: AppLanguageCode,
  status: string,
  fulfillment: string
): string {
  return processStatusLabel(status, fulfillment, "owner_badge", lang);
}

/** @deprecated `processStepLabel` + `processSteps` (`store-order-process-model`) */
export function ownerOpsFlowStepLabelsI18n(
  lang: AppLanguageCode,
  deliveryLike: boolean
): readonly string[] {
  if (deliveryLike) {
    return [
      translate(lang, "store_owner_ops_flow_new"),
      translate(lang, "store_owner_ops_flow_accepted"),
      translate(lang, "store_owner_ops_flow_cooking"),
      translate(lang, "store_owner_ops_flow_delivery_ready"),
      translate(lang, "store_owner_ops_flow_delivering"),
      translate(lang, "store_owner_ops_flow_near_address"),
      translate(lang, "store_owner_ops_flow_done"),
    ] as const;
  }
  return [
    translate(lang, "store_owner_ops_flow_new"),
    translate(lang, "store_owner_ops_flow_accepted"),
    translate(lang, "store_owner_ops_flow_cooking"),
    translate(lang, "store_owner_ops_flow_pickup_ready"),
    translate(lang, "store_owner_ops_flow_pickup_done"),
  ] as const;
}

const RIDER_STATUS_KEYS: Record<string, MessageKey> = {
  waiting_rider: "store_owner_rider_waiting",
  rider_assigned: "store_owner_rider_assigned",
  pickup_in_progress: "store_owner_rider_pickup_progress",
  delivering: "store_owner_rider_delivering",
  delivered: "store_owner_rider_delivered",
  delivery_failed: "store_owner_rider_failed",
};

export function ownerRiderStatusLabelI18n(lang: AppLanguageCode, status: string): string {
  const key = RIDER_STATUS_KEYS[status];
  return key ? translate(lang, key) : status;
}

const REVIEW_STATUS_KEYS: Record<string, MessageKey> = {
  pending: "store_owner_review_status_pending",
  completed: "store_owner_review_status_completed",
  unavailable: "store_owner_review_status_unavailable",
};

export function ownerReviewStatusLabelI18n(
  lang: AppLanguageCode,
  status: string | null | undefined
): string {
  const s = String(status ?? "").trim();
  if (!s) return translate(lang, "store_owner_review_status_na");
  const key = REVIEW_STATUS_KEYS[s];
  return key ? translate(lang, key) : s;
}
