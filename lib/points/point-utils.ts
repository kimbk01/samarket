/**
 * 23단계: 포인트 라벨 / 필터 — i18n via `point-label-i18n.ts`
 */

export {
  pointChargeStatusLabel,
  pointPaymentMethodLabel,
  pointLedgerEntryLabel,
  pointPromotionOrderStatusLabel,
  pointPromotionPlacementLabel,
  POINT_CHARGE_STATUS_OPTIONS,
} from "@/lib/points/point-label-i18n";

import {
  pointChargeStatusLabel,
  pointLedgerEntryLabel,
  pointPaymentMethodLabel,
  pointPromotionOrderStatusLabel,
  pointPromotionPlacementLabel,
} from "@/lib/points/point-label-i18n";
import type {
  PointChargeRequestStatus,
  PointLedgerEntryType,
  PointPaymentMethod,
  PointPromotionOrderStatus,
  PointPromotionPlacement,
} from "@/lib/types/point";

/** @deprecated use `pointChargeStatusLabel(status)` — default locale snapshot */
export const POINT_CHARGE_STATUS_LABELS: Record<PointChargeRequestStatus, string> = {
  pending: pointChargeStatusLabel("pending"),
  waiting_confirm: pointChargeStatusLabel("waiting_confirm"),
  on_hold: pointChargeStatusLabel("on_hold"),
  approved: pointChargeStatusLabel("approved"),
  rejected: pointChargeStatusLabel("rejected"),
  cancelled: pointChargeStatusLabel("cancelled"),
};

/** @deprecated use `pointPaymentMethodLabel(method)` */
export const POINT_PAYMENT_METHOD_LABELS: Record<PointPaymentMethod, string> = {
  bank_transfer: pointPaymentMethodLabel("bank_transfer"),
  gcash: pointPaymentMethodLabel("gcash"),
  manual_confirm: pointPaymentMethodLabel("manual_confirm"),
};

/** @deprecated use `pointLedgerEntryLabel(type)` */
export const POINT_LEDGER_ENTRY_LABELS: Record<PointLedgerEntryType, string> = {
  charge: pointLedgerEntryLabel("charge"),
  spend: pointLedgerEntryLabel("spend"),
  refund: pointLedgerEntryLabel("refund"),
  admin_adjust: pointLedgerEntryLabel("admin_adjust"),
  expire: pointLedgerEntryLabel("expire"),
  reward: pointLedgerEntryLabel("reward"),
  reverse: pointLedgerEntryLabel("reverse"),
  ad_purchase: pointLedgerEntryLabel("ad_purchase"),
  ad_refund: pointLedgerEntryLabel("ad_refund"),
};

/** @deprecated use `pointPromotionOrderStatusLabel(status)` */
export const POINT_PROMOTION_ORDER_STATUS_LABELS: Record<PointPromotionOrderStatus, string> = {
  pending: pointPromotionOrderStatusLabel("pending"),
  active: pointPromotionOrderStatusLabel("active"),
  expired: pointPromotionOrderStatusLabel("expired"),
  cancelled: pointPromotionOrderStatusLabel("cancelled"),
};

/** @deprecated use `pointPromotionPlacementLabel(placement)` */
export const POINT_PROMOTION_PLACEMENT_LABELS: Record<PointPromotionPlacement, string> = {
  home_top: pointPromotionPlacementLabel("home_top"),
  home_middle: pointPromotionPlacementLabel("home_middle"),
  search_top: pointPromotionPlacementLabel("search_top"),
  shop_featured: pointPromotionPlacementLabel("shop_featured"),
};

export interface AdminPointChargeFilters {
  requestStatus: PointChargeRequestStatus | "";
}

export function filterPointChargeRequests<T extends { requestStatus: PointChargeRequestStatus }>(
  list: T[],
  filters: AdminPointChargeFilters
): T[] {
  if (!filters.requestStatus) return [...list];
  return list.filter((r) => r.requestStatus === filters.requestStatus);
}
