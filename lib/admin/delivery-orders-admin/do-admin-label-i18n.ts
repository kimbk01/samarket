import { getRuntimeAppLanguage } from "@/lib/i18n/runtime-app-language";
import { translate, type MessageKey } from "@/lib/i18n/messages";
import { ORDER_STATUS_NAME_KEYS_WITHOUT_FULFILLMENT } from "@/lib/stores/store-order-process-model";
import type {
  AdminActionStatus,
  OrderStatus,
  PaymentStatus,
  SettlementStatus,
} from "@/lib/admin/delivery-orders-admin/types";

function doT(key: MessageKey): string {
  return translate(getRuntimeAppLanguage(), key);
}

const ORDER_KEYS: Record<OrderStatus, MessageKey> = ORDER_STATUS_NAME_KEYS_WITHOUT_FULFILLMENT;

const PAYMENT_KEYS: Record<PaymentStatus, MessageKey> = {
  pending: "admin_do_ps_pending",
  paid: "admin_do_ps_paid",
  failed: "admin_do_ps_failed",
  cancelled: "admin_do_ps_cancelled",
  refunded: "admin_do_ps_refunded",
};

const SETTLEMENT_KEYS: Record<SettlementStatus, MessageKey> = {
  scheduled: "admin_do_ss_scheduled",
  processing: "admin_do_ss_processing",
  paid: "admin_do_ss_paid",
  held: "admin_do_ss_held",
  cancelled: "admin_do_ss_cancelled",
  unknown: "admin_do_ss_unknown",
};

const ADMIN_ACTION_KEYS: Record<Exclude<AdminActionStatus, "none">, MessageKey> = {
  manual_hold: "admin_do_aa_manual_hold",
  admin_cancelled: "admin_do_aa_admin_cancelled",
  dispute_reviewing: "admin_do_aa_dispute_reviewing",
  refund_approved: "admin_do_aa_refund_approved",
  refund_rejected: "admin_do_aa_refund_rejected",
};

export function doAdminOrderStatusLabel(status: OrderStatus): string {
  return doT(ORDER_KEYS[status]);
}

export function doAdminPaymentStatusLabel(status: PaymentStatus): string {
  return doT(PAYMENT_KEYS[status]);
}

export function doAdminSettlementStatusLabel(status: SettlementStatus): string {
  return doT(SETTLEMENT_KEYS[status]);
}

export function doAdminActionStatusLabel(status: AdminActionStatus): string {
  if (status === "none") return "—";
  return doT(ADMIN_ACTION_KEYS[status]);
}
