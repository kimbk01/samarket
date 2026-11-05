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
  apple_iap: "point_pay_apple_iap",
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
  promotion_extend: "point_ledger_promotion_extend",
};

/**
 * 상위노출 신청 상태 이름 표 — 회원 상위노출 목록·기간 합계·포인트 내역 상세 시트가 함께 쓴다 (D-2).
 * `paused`(관리자·글 숨김으로 일시정지 · DB `paused_by`)는 타입에 없지만 실제 상태라 표에 둔다 —
 * 이전에 목록 합계만 따로 「일시정지」를 붙였고 상세 시트는 영문 코드를 그대로 보였다.
 */
export const POINT_PROMOTION_ORDER_STATUS_KEYS: Record<PointPromotionOrderStatus | "paused", MessageKey> = {
  pending: "point_status_pending",
  pending_review: "point_status_pending_review",
  active: "point_status_active",
  paused: "mypage_oa_ads_boost_status_paused",
  expired: "point_status_expired",
  ended: "point_status_ended",
  rejected: "revenue_hub_status_rejected",
  cancelled: "point_status_cancelled",
};

/** 화면 언어의 `t` 로 상위노출 상태 이름. 표에 없는 값은 숨기지 않고 받은 값 그대로. */
export function pointPromotionOrderStatusText(t: (key: MessageKey) => string, status: string): string {
  const key = (POINT_PROMOTION_ORDER_STATUS_KEYS as Record<string, MessageKey | undefined>)[status];
  return key ? t(key) : status;
}

const PLACEMENT_KEYS: Record<PointPromotionPlacement, MessageKey> = {
  home_top: "point_placement_home_top",
  home_middle: "point_placement_home_middle",
  search_top: "point_placement_search_top",
  shop_featured: "point_placement_shop_featured",
  feed_boost: "point_placement_feed_boost",
  community_top_pin: "point_placement_community_top_pin",
};

export function pointChargeStatusLabel(status: PointChargeRequestStatus): string {
  const key = (CHARGE_STATUS_KEYS as Record<string, MessageKey | undefined>)[status];
  // 표에 없는 값(빈 값 포함)은 번역 키 없이 받은 값 그대로 (키 문자열이 화면에 나오지 않게)
  return key ? pointT(key) : String(status ?? "");
}

export function pointPaymentMethodLabel(method: PointPaymentMethod): string {
  if (method === "gcash") return "GCash";
  return pointT(PAYMENT_METHOD_KEYS[method]);
}

export function pointLedgerEntryLabel(type: PointLedgerEntryType): string {
  return pointT(LEDGER_KEYS[type]);
}

export function pointPromotionOrderStatusLabel(status: PointPromotionOrderStatus): string {
  return pointT(POINT_PROMOTION_ORDER_STATUS_KEYS[status]);
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
