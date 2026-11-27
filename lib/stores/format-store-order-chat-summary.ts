import { formatStoreOrderDeliveryAddressPlain } from "@/lib/addresses/store-order-delivery-address-display";
import { formatMoneyPhp } from "@/lib/utils/format";
import { orderLineOptionsSummary } from "@/lib/stores/product-line-options";
import { orderStatusLabelForSummary } from "@/lib/store-order-chat/store-order-summary-timeline";
import type { AppLanguageCode } from "@/lib/i18n/config";
import { translate } from "@/lib/i18n/messages";
import { isApiErrorCode } from "@/lib/i18n/api-error-text";
import { getRuntimeAppLanguage } from "@/lib/i18n/runtime-app-language";

/**
 * 채팅·서버 idempotent 요약 — 단일 헤더 (구매자/매장 동일).
 * 한국어 저장본·레거시 판별(`collapse-duplicate-order-summaries`)과 같은 값을 유지하려고 ko 카탈로그 값을 쓴다.
 */
export const STORE_ORDER_SUMMARY_HEADER = translate("ko", "cm_home_preview_order_summary");

export type ChatSummaryOrderFields = {
  store_name?: string;
  order_no?: string;
  order_status?: string;
  /** 오너 주문 처리(상태 전이)용 — API `store_orders.fulfillment_type` */
  fulfillment_type?: string;
  delivery_address_summary?: string | null;
  delivery_address_detail?: string | null;
  buyer_phone?: string | null;
  buyer_note?: string | null;
  payment_amount?: number;
  discount_amount?: number | null;
  delivery_fee_amount?: number | null;
  buyer_payment_method?: string | null;
  buyer_payment_method_detail?: string | null;
  created_at?: string | null;
  accepted_at?: string | null;
  estimated_prep_minutes?: number | null;
  estimated_ready_at?: string | null;
};

export type ChatSummaryItemFields = {
  product_title_snapshot: string;
  price_snapshot: number;
  qty: number;
  subtotal?: number | null;
  options_snapshot_json?: unknown;
};

/**
 * 채팅방 주문 요약 — 자동·수동 전송 모두 동일 포맷 (문구는 카탈로그 `store_order_summary_*`).
 * `language` 를 넘기면 그 언어로, 서버 저장본(레거시 판별 유지)은 `"ko"`.
 */
export function formatStoreOrderSummaryText(
  order: ChatSummaryOrderFields,
  items: ChatSummaryItemFields[],
  language: AppLanguageCode,
  /** 상태 라벨 언어 — 기본은 `language` (서버 저장본 호환은 아래 deprecated 함수 참고) */
  statusLanguage: AppLanguageCode = language
): string {
  const tr = (key: Parameters<typeof translate>[1], vars?: Record<string, string | number>) =>
    translate(language, key, vars);
  const lines: string[] = [];
  lines.push(tr("cm_home_preview_order_summary"));
  if (order.store_name) lines.push(tr("store_order_summary_store", { store: order.store_name }));
  if (order.order_no) lines.push(tr("store_order_summary_order_no", { orderNo: order.order_no }));
  if (order.order_status) {
    const raw = order.order_status.trim();
    const labeled = isApiErrorCode(raw) /* DB 상태 코드 모양(`accepted` …)이 아니면 이미 사람이 읽는 라벨 */
      ? orderStatusLabelForSummary(raw, order.fulfillment_type ?? "local_delivery", statusLanguage)
      : order.order_status;
    lines.push(tr("store_order_summary_status", { status: labeled }));
  }
  const deliveryAddr = formatStoreOrderDeliveryAddressPlain({
    summary: order.delivery_address_summary,
    detail: order.delivery_address_detail,
  });
  if (deliveryAddr) {
    lines.push(tr("store_order_summary_address", { address: deliveryAddr }));
  }
  if (order.buyer_phone?.trim()) {
    lines.push(tr("store_oc_summary_phone", { phone: order.buyer_phone.trim() }));
  }
  if (items.length > 0) {
    lines.push(tr("store_order_summary_items"));
    for (const it of items) {
      const opt = orderLineOptionsSummary(it.options_snapshot_json, language);
      const titleLine = [it.product_title_snapshot, opt].filter(Boolean).join(" · ");
      const subtotal = Number(it.subtotal ?? it.price_snapshot * it.qty) || 0;
      lines.push(`· ${titleLine} ${formatMoneyPhp(it.price_snapshot)} × ${it.qty} = ${formatMoneyPhp(subtotal)}`);
    }
  }
  if (order.discount_amount != null && Number(order.discount_amount) > 0) {
    lines.push(tr("store_order_summary_discount", { amount: formatMoneyPhp(order.discount_amount) }));
  }
  if (order.delivery_fee_amount != null && Number(order.delivery_fee_amount) > 0) {
    lines.push(tr("store_order_summary_delivery_fee", { amount: formatMoneyPhp(order.delivery_fee_amount) }));
  }
  if (typeof order.payment_amount === "number") {
    lines.push(tr("store_order_summary_total", { amount: formatMoneyPhp(order.payment_amount) }));
  }
  if (order.buyer_note?.trim()) {
    lines.push(tr("store_order_summary_note", { note: order.buyer_note.trim() }));
  }
  return lines.join("\n");
}

/**
 * @deprecated 언어를 받는 `formatStoreOrderSummaryText` 를 쓴다.
 * 서버 저장본 호환(한국어 레거시 판별 `isStoreOrderSummarySystemContent`·같은 값이면 다시 쓰지 않는 비교) 때문에
 * 본문은 ko, 상태 라벨은 예전과 같이 런타임 언어로 만든다 — 저장 본문이 바뀌지 않는다.
 */
export function formatStoreOrderSummaryForChatMessage(
  order: ChatSummaryOrderFields,
  items: ChatSummaryItemFields[],
  _role: "seller" | "buyer" = "seller"
): string {
  return formatStoreOrderSummaryText(order, items, "ko", getRuntimeAppLanguage());
}
