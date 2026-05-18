import type { AppLanguageCode } from "@/lib/i18n/config";
import { translate, type MessageKey } from "@/lib/i18n/messages";
import { getRuntimeAppLanguage } from "@/lib/i18n/runtime-app-language";
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

const TRANSITION_NEXT_KEYS: Partial<Record<string, MessageKey>> = {
  accepted: "store_owner_transition_accepted",
  preparing: "store_owner_transition_preparing",
  ready_for_pickup: "store_owner_transition_ready",
  delivering: "store_owner_transition_delivering",
  arrived: "store_owner_transition_arrived",
  completed: "store_owner_transition_completed",
};

/** 사장님·비즈 콘솔: 현재 상태 → 다음 상태 버튼 문구 */
export function labelForOwnerTransitionI18n(
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
