import { formatMoneyPhp } from "@/lib/utils/format";
import { orderLineOptionsSummary } from "@/lib/stores/product-line-options";

export type ChatSummaryOrderFields = {
  store_name?: string;
  order_no?: string;
  order_status?: string;
  delivery_address_summary?: string | null;
  delivery_address_detail?: string | null;
  buyer_phone?: string | null;
  buyer_note?: string | null;
  payment_amount?: number;
  delivery_fee_amount?: number | null;
};

export type ChatSummaryItemFields = {
  product_title_snapshot: string;
  price_snapshot: number;
  qty: number;
  options_snapshot_json?: unknown;
};

/** 채팅방에 붙여넣기 좋은 주문 요약 텍스트 (매장 → 구매자 안내용) */
export function formatStoreOrderSummaryForChatMessage(
  order: ChatSummaryOrderFields,
  items: ChatSummaryItemFields[],
  role: "seller" | "buyer" = "seller"
): string {
  const lines: string[] = [];
  lines.push(role === "seller" ? "📋 [매장] 주문 내용 전달" : "📋 [주문 요약]");
  if (order.store_name) lines.push(`매장: ${order.store_name}`);
  if (order.order_no) lines.push(`주문번호: ${order.order_no}`);
  if (order.order_status) lines.push(`상태: ${order.order_status}`);
  if (order.delivery_address_summary?.trim()) {
    lines.push(`배달지역: ${order.delivery_address_summary.trim()}`);
  }
  if (order.delivery_address_detail?.trim()) {
    lines.push(`상세주소: ${order.delivery_address_detail.trim()}`);
  }
  if (order.buyer_phone?.trim()) {
    lines.push(`연락처: ${order.buyer_phone.trim()}`);
  }
  if (items.length > 0) {
    lines.push("— 품목 —");
    for (const it of items) {
      const opt = orderLineOptionsSummary(it.options_snapshot_json);
      const titleLine = [it.product_title_snapshot, opt].filter(Boolean).join(" · ");
      lines.push(`· ${titleLine} ${formatMoneyPhp(it.price_snapshot)} × ${it.qty}`);
    }
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
