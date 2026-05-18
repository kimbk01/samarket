import { getRuntimeAppLanguage } from "@/lib/i18n/runtime-app-language";
import { translate, type MessageKey } from "@/lib/i18n/messages";
import type {
  AdApplicationStatus,
  AdPaymentMethod,
  AdPaymentStatus,
  AdPlacement,
  AdTargetType,
} from "@/lib/types/ad-application";

function adT(key: MessageKey): string {
  return translate(getRuntimeAppLanguage(), key);
}

const TARGET_KEYS: Record<AdTargetType, MessageKey> = {
  product: "ad_app_target_product",
  shop: "ad_app_target_shop",
  banner: "ad_app_target_banner",
};

const PLACEMENT_KEYS: Record<AdPlacement, MessageKey> = {
  home_top: "ad_app_place_home_top",
  home_middle: "ad_app_place_home_middle",
  search_top: "ad_app_place_search_top",
  product_detail: "ad_app_place_product_detail",
  shop_featured: "ad_app_place_shop_featured",
};

const APP_STATUS_KEYS: Record<AdApplicationStatus, MessageKey> = {
  pending: "ad_app_status_pending",
  waiting_payment: "ad_app_status_waiting_payment",
  approved: "ad_app_status_approved",
  rejected: "ad_app_status_rejected",
  active: "ad_app_status_active",
  expired: "ad_app_status_expired",
  cancelled: "ad_app_status_cancelled",
};

const PAY_STATUS_KEYS: Record<AdPaymentStatus, MessageKey> = {
  unpaid: "ad_app_pay_unpaid",
  waiting_confirm: "ad_app_pay_waiting_confirm",
  paid: "ad_app_pay_paid",
  refunded: "ad_app_pay_refunded",
};

const PAY_METHOD_KEYS: Record<AdPaymentMethod, MessageKey> = {
  bank_transfer: "ad_app_method_bank",
  gcash: "ad_app_method_gcash",
  manual_confirm: "ad_app_method_manual",
};

export function adTargetLabel(target: AdTargetType): string {
  return adT(TARGET_KEYS[target]);
}

export function adPlacementLabel(placement: AdPlacement): string {
  return adT(PLACEMENT_KEYS[placement]);
}

export function adApplicationStatusLabel(status: AdApplicationStatus): string {
  return adT(APP_STATUS_KEYS[status]);
}

export function adPaymentStatusLabel(status: AdPaymentStatus): string {
  return adT(PAY_STATUS_KEYS[status]);
}

export function adPaymentMethodLabel(method: AdPaymentMethod): string {
  return adT(PAY_METHOD_KEYS[method]);
}

export const AD_APPLICATION_STATUS_FILTER_VALUES: (AdApplicationStatus | "")[] = [
  "",
  "pending",
  "waiting_payment",
  "approved",
  "rejected",
  "active",
  "expired",
  "cancelled",
];

/** @deprecated use `adTargetLabel` */
export const AD_TARGET_LABELS: Record<AdTargetType, string> = {
  product: adTargetLabel("product"),
  shop: adTargetLabel("shop"),
  banner: adTargetLabel("banner"),
};

/** @deprecated use `adPlacementLabel` */
export const AD_PLACEMENT_LABELS: Record<AdPlacement, string> = {
  home_top: adPlacementLabel("home_top"),
  home_middle: adPlacementLabel("home_middle"),
  search_top: adPlacementLabel("search_top"),
  product_detail: adPlacementLabel("product_detail"),
  shop_featured: adPlacementLabel("shop_featured"),
};

/** @deprecated use `adApplicationStatusLabel` */
export const AD_APPLICATION_STATUS_LABELS: Record<AdApplicationStatus, string> = {
  pending: adApplicationStatusLabel("pending"),
  waiting_payment: adApplicationStatusLabel("waiting_payment"),
  approved: adApplicationStatusLabel("approved"),
  rejected: adApplicationStatusLabel("rejected"),
  active: adApplicationStatusLabel("active"),
  expired: adApplicationStatusLabel("expired"),
  cancelled: adApplicationStatusLabel("cancelled"),
};

/** @deprecated use `adPaymentStatusLabel` */
export const AD_PAYMENT_STATUS_LABELS: Record<AdPaymentStatus, string> = {
  unpaid: adPaymentStatusLabel("unpaid"),
  waiting_confirm: adPaymentStatusLabel("waiting_confirm"),
  paid: adPaymentStatusLabel("paid"),
  refunded: adPaymentStatusLabel("refunded"),
};

/** @deprecated use `adPaymentMethodLabel` */
export const AD_PAYMENT_METHOD_LABELS: Record<AdPaymentMethod, string> = {
  bank_transfer: adPaymentMethodLabel("bank_transfer"),
  gcash: adPaymentMethodLabel("gcash"),
  manual_confirm: adPaymentMethodLabel("manual_confirm"),
};

/** @deprecated use `AD_APPLICATION_STATUS_FILTER_VALUES` + admin `STATUS_OPTION_KEYS` */
export const AD_APPLICATION_STATUS_OPTIONS: { value: AdApplicationStatus | ""; label: string }[] =
  AD_APPLICATION_STATUS_FILTER_VALUES.map((value) => ({
    value,
    label: value ? adApplicationStatusLabel(value) : adT("ad_app_filter_all"),
  }));
