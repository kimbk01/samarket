import { formatStoreOrderDeliveryAddressPlain } from "@/lib/addresses/store-order-delivery-address-display";
import { formatMoneyPhp } from "@/lib/utils/format";
import { orderLineOptionsSummary } from "@/lib/stores/product-line-options";
import { orderStatusLabelForSummary } from "@/lib/store-order-chat/store-order-summary-timeline";

/** 채팅·서버 idempotent 요약 — 단일 헤더 (구매자/매장 동일) */
export const STORE_ORDER_SUMMARY_HEADER = "📋 주문 요약";

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

/** 채팅방 주문 요약 — 자동·수동 전송 모두 동일 포맷 */
export function formatStoreOrderSummaryForChatMessage(
  order: ChatSummaryOrderFields,
  items: ChatSummaryItemFields[],
  _role: "seller" | "buyer" = "seller"
): string {
  const lines: string[] = [];
  lines.push(STORE_ORDER_SUMMARY_HEADER);
  if (order.store_name) lines.push(`매장: ${order.store_name}`);
  if (order.order_no) lines.push(`주문번호: ${order.order_no}`);
  if (order.order_status) {
    const labeled =
      order.order_status.includes("주문") || order.order_status.includes("배달") || order.order_status.includes("조리")
        ? order.order_status
        : orderStatusLabelForSummary(order.order_status, order.fulfillment_type ?? "local_delivery");
    lines.push(`상태: ${labeled}`);
  }
  const deliveryAddr = formatStoreOrderDeliveryAddressPlain({
    summary: order.delivery_address_summary,
    detail: order.delivery_address_detail,
  });
  if (deliveryAddr) {
    lines.push(`배달 주소: ${deliveryAddr}`);
  }
  if (order.buyer_phone?.trim()) {
    lines.push(`연락처: ${order.buyer_phone.trim()}`);
  }
  if (items.length > 0) {
    lines.push("— 품목 —");
    for (const it of items) {
      const opt = orderLineOptionsSummary(it.options_snapshot_json);
      const titleLine = [it.product_title_snapshot, opt].filter(Boolean).join(" · ");
      const subtotal = Number(it.subtotal ?? it.price_snapshot * it.qty) || 0;
      lines.push(`· ${titleLine} ${formatMoneyPhp(it.price_snapshot)} × ${it.qty} = ${formatMoneyPhp(subtotal)}`);
    }
  }
  if (order.discount_amount != null && Number(order.discount_amount) > 0) {
    lines.push(`할인: -${formatMoneyPhp(order.discount_amount)}`);
  }
  if (order.delivery_fee_amount != null && Number(order.delivery_fee_amount) > 0) {
    lines.push(`배달비: ${formatMoneyPhp(order.delivery_fee_amount)}`);
  }
  if (typeof order.payment_amount === "number") {
    lines.push(`합계: ${formatMoneyPhp(order.payment_amount)}`);
  }
  if (order.buyer_note?.trim()) {
    lines.push(`요청사항: ${order.buyer_note.trim()}`);
  }
  return lines.join("\n");
}
