"use client";

import { useCallback } from "react";
import { useI18n } from "@/components/i18n/AppLanguageProvider";
import type { MessageKey } from "@/lib/i18n/messages";
import type {
  AdminActionStatus,
  OrderStatus,
  PaymentStatus,
  SettlementStatus,
} from "@/lib/admin/delivery-orders-admin/types";

export const DO_ORDER_STATUS_KEYS: Record<OrderStatus, MessageKey> = {
  pending: "admin_stores_orders_status_pending",
  accepted: "admin_stores_orders_status_accepted",
  preparing: "admin_stores_orders_status_preparing",
  ready_for_pickup: "admin_stores_orders_status_ready_for_pickup",
  delivering: "admin_stores_orders_status_delivering",
  arrived: "admin_stores_orders_status_arrived",
  completed: "admin_stores_orders_status_completed",
  cancel_requested: "admin_do_os_cancel_requested",
  cancelled: "admin_stores_orders_status_cancelled",
  refund_requested: "admin_stores_orders_status_refund_requested",
  refunded: "admin_stores_orders_status_refunded",
};

export const DO_PAYMENT_STATUS_KEYS: Record<PaymentStatus, MessageKey> = {
  pending: "admin_do_ps_pending",
  paid: "admin_do_ps_paid",
  failed: "admin_do_ps_failed",
  cancelled: "admin_do_ps_cancelled",
  refunded: "admin_do_ps_refunded",
};

export const DO_SETTLEMENT_STATUS_KEYS: Record<SettlementStatus, MessageKey> = {
  scheduled: "admin_do_ss_scheduled",
  processing: "admin_do_ss_processing",
  paid: "admin_do_ss_paid",
  held: "admin_do_ss_held",
  cancelled: "admin_do_ss_cancelled",
  unknown: "admin_do_ss_unknown",
};

export const DO_ADMIN_ACTION_KEYS: Record<Exclude<AdminActionStatus, "none">, MessageKey> = {
  manual_hold: "admin_do_aa_manual_hold",
  admin_cancelled: "admin_do_aa_admin_cancelled",
  dispute_reviewing: "admin_do_aa_dispute_reviewing",
  refund_approved: "admin_do_aa_refund_approved",
  refund_rejected: "admin_do_aa_refund_rejected",
};

export const DO_ORDER_STATUS_LIST = Object.keys(DO_ORDER_STATUS_KEYS) as OrderStatus[];
export const DO_PAYMENT_STATUS_LIST = Object.keys(DO_PAYMENT_STATUS_KEYS) as PaymentStatus[];
export const DO_SETTLEMENT_STATUS_LIST = Object.keys(DO_SETTLEMENT_STATUS_KEYS) as SettlementStatus[];

export function useDoAdminStatusLabels() {
  const { t } = useI18n();

  const orderStatus = useCallback((status: OrderStatus) => t(DO_ORDER_STATUS_KEYS[status]), [t]);
  const paymentStatus = useCallback((status: PaymentStatus) => t(DO_PAYMENT_STATUS_KEYS[status]), [t]);
  const settlementStatus = useCallback(
    (status: SettlementStatus) => t(DO_SETTLEMENT_STATUS_KEYS[status]),
    [t]
  );
  const adminAction = useCallback(
    (status: Exclude<AdminActionStatus, "none">) => t(DO_ADMIN_ACTION_KEYS[status]),
    [t]
  );

  return { orderStatus, paymentStatus, settlementStatus, adminAction };
}
