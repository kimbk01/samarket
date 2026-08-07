import { getRuntimeAppLanguage } from "@/lib/i18n/runtime-app-language";
import { translate, type MessageKey } from "@/lib/i18n/messages";
import type {
  PointChargeRequestStatus,
  PointLedgerEntryType,
  PointPaymentMethod,
  PointPromotionOrderStatus,
  PointPromotionPlacement,
} from "@/lib/types/point";

function pointT(key: MessageKey): string {
  return translate(getRuntimeAppLanguage(), key);
}

const CHARGE_STATUS_KEYS: Record<PointChargeRequestStatus, MessageKey> = {
  pending: "point_status_pending",
  waiting_confirm: "point_status_waiting_confirm",
  on_hold: "point_status_on_hold",
  approved: "point_status_approved",
  rejected: "point_status_rejected",
  cancelled: "point_status_cancelled",
};

const PAYMENT_METHOD_KEYS: Record<PointPaymentMethod, MessageKey> = {
  bank_transfer: "point_pay_bank_transfer",
  gcash: "point_pay_gcash",
  manual_confirm: "point_pay_manual_confirm",
};

const LEDGER_KEYS: Record<PointLedgerEntryType, MessageKey> = {
  charge: "point_ledger_charge",
  spend: "point_ledger_spend",
  refund: "point_ledger_refund",
  admin_adjust: "point_ledger_admin_adjust",
  admin_credit: "point_ledger_admin_credit",
  admin_debit: "point_ledger_admin_debit",
  expire: "point_ledger_expire",
  reward: "point_ledger_reward",
  reverse: "point_ledger_reverse",
  ad_purchase: "point_ledger_ad_purchase",
  ad_refund: "point_ledger_ad_refund",
  ad_hold: "point_ledger_ad_hold",
  ad_hold_release: "point_ledger_ad_hold_release",
  ad_charge: "point_ledger_ad_charge",
};

const PROMO_ORDER_KEYS: Record<PointPromotionOrderStatus, MessageKey> = {
  pending: "point_status_pending",
  active: "point_status_active",
  expired: "point_status_expired",
  cancelled: "point_status_cancelled",
};

const PLACEMENT_KEYS: Record<PointPromotionPlacement, MessageKey> = {
  home_top: "point_placement_home_top",
  home_middle: "point_placement_home_middle",
  search_top: "point_placement_search_top",
  shop_featured: "point_placement_shop_featured",
  feed_boost: "point_placement_feed_boost",
};

export function pointChargeStatusLabel(status: PointChargeRequestStatus): string {
  return pointT(CHARGE_STATUS_KEYS[status]);
}

export function pointPaymentMethodLabel(method: PointPaymentMethod): string {
  if (method === "gcash") return "GCash";
  return pointT(PAYMENT_METHOD_KEYS[method]);
}

export function pointLedgerEntryLabel(type: PointLedgerEntryType): string {
  return pointT(LEDGER_KEYS[type]);
}

export function pointPromotionOrderStatusLabel(status: PointPromotionOrderStatus): string {
  return pointT(PROMO_ORDER_KEYS[status]);
}

export function pointPromotionPlacementLabel(placement: PointPromotionPlacement): string {
  return pointT(PLACEMENT_KEYS[placement]);
}

export const POINT_CHARGE_STATUS_OPTIONS: {
  value: PointChargeRequestStatus | "";
  labelKey: MessageKey;
}[] = [
  { value: "", labelKey: "point_filter_all" },
  { value: "pending", labelKey: "point_status_pending" },
  { value: "waiting_confirm", labelKey: "point_status_waiting_confirm" },
  { value: "on_hold", labelKey: "point_status_on_hold" },
  { value: "approved", labelKey: "point_status_approved" },
  { value: "rejected", labelKey: "point_status_rejected" },
  { value: "cancelled", labelKey: "point_status_cancelled" },
];
