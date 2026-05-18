import type { AdminActionStatus, OrderStatus, PaymentStatus, SettlementStatus } from "./types";
import {
  doAdminActionStatusLabel,
  doAdminOrderStatusLabel,
  doAdminPaymentStatusLabel,
  doAdminSettlementStatusLabel,
} from "@/lib/admin/delivery-orders-admin/do-admin-label-i18n";

/** @deprecated use `doAdminPaymentStatusLabel` */
export const PAYMENT_LABEL: Record<PaymentStatus, string> = {
  pending: doAdminPaymentStatusLabel("pending"),
  paid: doAdminPaymentStatusLabel("paid"),
  failed: doAdminPaymentStatusLabel("failed"),
  cancelled: doAdminPaymentStatusLabel("cancelled"),
  refunded: doAdminPaymentStatusLabel("refunded"),
};

/** @deprecated use `doAdminOrderStatusLabel` */
export const ORDER_STATUS_LABEL: Record<OrderStatus, string> = {
  pending: doAdminOrderStatusLabel("pending"),
  accepted: doAdminOrderStatusLabel("accepted"),
  preparing: doAdminOrderStatusLabel("preparing"),
  ready_for_pickup: doAdminOrderStatusLabel("ready_for_pickup"),
  delivering: doAdminOrderStatusLabel("delivering"),
  arrived: doAdminOrderStatusLabel("arrived"),
  completed: doAdminOrderStatusLabel("completed"),
  cancel_requested: doAdminOrderStatusLabel("cancel_requested"),
  cancelled: doAdminOrderStatusLabel("cancelled"),
  refund_requested: doAdminOrderStatusLabel("refund_requested"),
  refunded: doAdminOrderStatusLabel("refunded"),
};

/** @deprecated use `doAdminSettlementStatusLabel` */
export const SETTLEMENT_LABEL: Record<SettlementStatus, string> = {
  scheduled: doAdminSettlementStatusLabel("scheduled"),
  processing: doAdminSettlementStatusLabel("processing"),
  paid: doAdminSettlementStatusLabel("paid"),
  held: doAdminSettlementStatusLabel("held"),
  cancelled: doAdminSettlementStatusLabel("cancelled"),
};

/** @deprecated use `doAdminActionStatusLabel` */
export const ADMIN_ACTION_LABEL: Record<AdminActionStatus, string> = {
  none: doAdminActionStatusLabel("none"),
  manual_hold: doAdminActionStatusLabel("manual_hold"),
  admin_cancelled: doAdminActionStatusLabel("admin_cancelled"),
  dispute_reviewing: doAdminActionStatusLabel("dispute_reviewing"),
  refund_approved: doAdminActionStatusLabel("refund_approved"),
  refund_rejected: doAdminActionStatusLabel("refund_rejected"),
};
