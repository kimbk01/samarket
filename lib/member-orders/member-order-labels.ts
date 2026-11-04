import type { AppLanguageCode } from "@/lib/i18n/config";
import { translate, type MessageKey } from "@/lib/i18n/messages";
import { getRuntimeAppLanguage } from "@/lib/i18n/runtime-app-language";
import type { MemberOrderStatus, PaymentStatus } from "./types";
import { orderStatusName } from "@/lib/stores/store-order-process-model";

const PAYMENT_KEYS: Record<PaymentStatus, MessageKey> = {
  pending: "member_order_payment_pending",
  paid: "member_order_payment_paid",
  failed: "member_order_payment_failed",
  cancelled: "member_order_payment_cancelled",
  refunded: "member_order_payment_refunded",
};

/** 회원 노출용 상태 이름 — 4단계 정본 (`store-order-process-model`) */
export function memberOrderStatusUserMessage(
  status: MemberOrderStatus,
  lang: AppLanguageCode = getRuntimeAppLanguage(),
  fulfillment: string = "local_delivery"
): string {
  return orderStatusName(status, fulfillment, lang);
}

export function memberOrderPaymentLabel(
  status: PaymentStatus,
  lang: AppLanguageCode = getRuntimeAppLanguage()
): string {
  return translate(lang, PAYMENT_KEYS[status]);
}
