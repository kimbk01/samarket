import type { AppLanguageCode } from "@/lib/i18n/config";
import { translate, type MessageKey } from "@/lib/i18n/messages";
import { getRuntimeAppLanguage } from "@/lib/i18n/runtime-app-language";
import type { MemberOrderStatus, PaymentStatus } from "./types";

const STATUS_MSG_KEYS: Record<MemberOrderStatus, MessageKey> = {
  pending: "member_order_status_msg_pending",
  accepted: "member_order_status_msg_accepted",
  preparing: "member_order_status_msg_preparing",
  delivering: "member_order_status_msg_delivering",
  ready_for_pickup: "member_order_status_msg_ready_for_pickup",
  arrived: "member_order_status_msg_arrived",
  completed: "member_order_status_msg_completed",
  cancelled: "member_order_status_msg_cancelled",
  cancel_requested: "member_order_status_msg_cancel_requested",
  refund_requested: "member_order_status_msg_refund_requested",
  refunded: "member_order_status_msg_refunded",
};

const PAYMENT_KEYS: Record<PaymentStatus, MessageKey> = {
  pending: "member_order_payment_pending",
  paid: "member_order_payment_paid",
  failed: "member_order_payment_failed",
  cancelled: "member_order_payment_cancelled",
  refunded: "member_order_payment_refunded",
};

/** 회원 노출용 한 줄 안내 */
export function memberOrderStatusUserMessage(
  status: MemberOrderStatus,
  lang: AppLanguageCode = getRuntimeAppLanguage()
): string {
  return translate(lang, STATUS_MSG_KEYS[status]);
}

export function memberOrderPaymentLabel(
  status: PaymentStatus,
  lang: AppLanguageCode = getRuntimeAppLanguage()
): string {
  return translate(lang, PAYMENT_KEYS[status]);
}
