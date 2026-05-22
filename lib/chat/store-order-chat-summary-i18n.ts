import type { AppLanguageCode } from "@/lib/i18n/config";
import { DEFAULT_APP_LANGUAGE } from "@/lib/i18n/config";
import { translate, type MessageKey } from "@/lib/i18n/messages";
import { formatMoneyPhp } from "@/lib/utils/format";
import { formatStoreOrderDeliveryAddressPlain } from "@/lib/addresses/store-order-delivery-address-display";
import type { StoreOrderSummaryInput } from "@/lib/chat/store-order-chat-summary-body";

function ocT(lang: AppLanguageCode, key: MessageKey, vars?: Record<string, string | number>): string {
  return translate(lang, key, vars);
}

export function fulfillmentLabel(
  ft: string | null | undefined,
  lang: AppLanguageCode = DEFAULT_APP_LANGUAGE
): string {
  const s = String(ft ?? "").trim();
  if (s === "local_delivery" || s === "shipping") {
    return ocT(lang, "store_oc_fulfillment_delivery");
  }
  return ocT(lang, "store_oc_fulfillment_pickup");
}

export function buildStoreOrderSummaryBodyI18n(
  input: StoreOrderSummaryInput,
  lang: AppLanguageCode = DEFAULT_APP_LANGUAGE
): string {
  const parts: string[] = [];
  parts.push(ocT(lang, "store_oc_summary_received"));
  parts.push(ocT(lang, "store_oc_summary_order_no", { orderNo: input.orderNo }));
  parts.push(ocT(lang, "store_oc_summary_store", { storeName: input.storeName }));
  parts.push(
    ocT(lang, "store_oc_summary_buyer", {
      buyer: input.buyerNickname.trim() || ocT(lang, "store_oc_customer_fallback"),
    })
  );
  if (input.buyerPhoneDisplay) {
    parts.push(ocT(lang, "store_oc_summary_phone", { phone: input.buyerPhoneDisplay }));
  }
  parts.push("");
  parts.push(
    ocT(lang, "store_oc_summary_fulfillment", {
      label: input.fulfillmentLabel,
    })
  );
  parts.push(
    ocT(lang, "store_oc_summary_payment_status", {
      status: input.paymentStatusLabel ?? ocT(lang, "store_oc_payment_ref"),
    })
  );
  const paySel = (input.selectedPaymentLabel ?? "").trim();
  if (paySel) parts.push(ocT(lang, "store_oc_summary_payment_selected", { label: paySel }));
  const payNote = (input.paymentMethodNote ?? "").trim();
  if (payNote) parts.push(payNote);
  if (input.deliveryCourierLabel?.trim()) {
    parts.push(
      ocT(lang, "store_oc_summary_delivery_note", {
        label: input.deliveryCourierLabel.trim(),
      })
    );
  }
  parts.push("");
  parts.push(ocT(lang, "store_oc_summary_items_header"));
  for (const line of input.lines) {
    const opt = line.optionsLine?.trim();
    parts.push(
      ocT(lang, "store_oc_summary_line_item", {
        title: line.title,
        qty: line.qty,
        total: formatMoneyPhp(line.unitPhp * line.qty),
        unit: formatMoneyPhp(line.unitPhp),
      })
    );
    if (opt) parts.push(ocT(lang, "store_oc_summary_line_options", { options: opt }));
  }
  parts.push("");
  parts.push(ocT(lang, "store_oc_summary_subtotal", { amount: formatMoneyPhp(input.itemsSubtotalPhp) }));
  parts.push(ocT(lang, "store_oc_summary_delivery_fee", { amount: formatMoneyPhp(input.deliveryFeePhp) }));
  if (input.discountPhp > 0) {
    parts.push(ocT(lang, "store_oc_summary_discount", { amount: formatMoneyPhp(input.discountPhp) }));
  }
  parts.push(ocT(lang, "store_oc_summary_divider"));
  parts.push(ocT(lang, "store_oc_summary_total", { amount: formatMoneyPhp(input.totalPhp) }));
  parts.push("");

  const deliveryAddr = formatStoreOrderDeliveryAddressPlain({
    summary: input.addressSummary,
    detail: input.addressDetail,
  });
  if (deliveryAddr) {
    parts.push(ocT(lang, "store_oc_summary_address_header"));
    parts.push(`  ${deliveryAddr}`);
    parts.push("");
  }

  const note = input.buyerNote?.trim();
  if (note) {
    parts.push(ocT(lang, "store_oc_summary_buyer_note", { note }));
    parts.push("");
  }

  const bank = input.bankLine?.trim();
  if (bank) {
    parts.push(ocT(lang, "store_oc_summary_bank_header"));
    parts.push(bank);
  }

  return parts.join("\n").trimEnd();
}
