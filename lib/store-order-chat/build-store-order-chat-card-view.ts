import { formatStoreOrderDeliveryAddressPlain } from "@/lib/addresses/store-order-delivery-address-display";
import {
  formatBuyerPaymentDisplay,
  normalizeCheckoutPaymentMethodId,
} from "@/lib/stores/payment-methods-config";
import { orderLineOptionsSummary } from "@/lib/stores/product-line-options";
import { BUYER_ORDER_STATUS_LABEL } from "@/lib/stores/store-order-process-criteria";
import { isDeliveryFulfillment } from "@/lib/stores/order-status-transitions";
import {
  buildStoreOrderSummaryTimelineSteps,
  type StoreOrderSummaryTimelineStep,
} from "@/lib/store-order-chat/store-order-summary-timeline";

export type StoreOrderChatCardItemView = {
  title: string;
  options: string;
  unitPrice: number;
  qty: number;
  subtotal: number;
};

export type StoreOrderChatCardView = {
  orderId: string;
  orderNo: string;
  storeName: string;
  status: string;
  statusLabel: string;
  fulfillmentType: string;
  fulfillmentLabel: string;
  isDelivery: boolean;
  createdAt: string | null;
  acceptedAt: string | null;
  estimatedPrepMinutes: number | null;
  estimatedReadyAt: string | null;
  addressLines: string[];
  buyerPhone: string | null;
  buyerNote: string | null;
  paymentMethodLabel: string | null;
  items: StoreOrderChatCardItemView[];
  totals: {
    itemsSubtotal: number;
    deliveryFee: number;
    discount: number;
    paymentTotal: number;
  };
  timeline: StoreOrderSummaryTimelineStep[];
};

export type StoreOrderChatCardInput = {
  order: Record<string, unknown>;
  items?: Array<Record<string, unknown>>;
  events?: Array<{ to_status?: string | null; created_at?: string | null }>;
  storeName?: string;
  storePickupAddressLines?: string[];
};

function text(value: unknown): string {
  return typeof value === "string" ? value.trim() : "";
}

function money(value: unknown): number {
  const n = Number(value ?? 0);
  return Number.isFinite(n) ? Math.max(0, Math.round(n)) : 0;
}

function nullableText(value: unknown): string | null {
  const s = text(value);
  return s ? s : null;
}

function nullableInt(value: unknown): number | null {
  const n = Math.floor(Number(value));
  return Number.isFinite(n) && n > 0 ? n : null;
}

function paymentMethodLabel(order: Record<string, unknown>): string | null {
  const method = text(order.buyer_payment_method);
  const detail = text(order.buyer_payment_method_detail);
  if (!method && !detail) return null;
  const normalized = normalizeCheckoutPaymentMethodId(method) ?? method;
  return formatBuyerPaymentDisplay(normalized, detail || null);
}

function buildAddressLines(input: StoreOrderChatCardInput, fulfillmentType: string): string[] {
  if (fulfillmentType === "pickup" && input.storePickupAddressLines?.length) {
    return input.storePickupAddressLines.filter(Boolean);
  }
  const order = input.order;
  const plain = formatStoreOrderDeliveryAddressPlain({
    summary: text(order.delivery_address_summary) || text(order.delivery_formatted_address),
    detail: text(order.delivery_address_detail) || text(order.delivery_detail_address),
  });
  return plain ? [plain] : [];
}

export function buildStoreOrderChatCardView(input: StoreOrderChatCardInput): StoreOrderChatCardView {
  const order = input.order;
  const fulfillmentType = text(order.fulfillment_type) || "pickup";
  const status = text(order.order_status) || "pending";
  const items = (input.items ?? []).map((it) => {
    const unitPrice = money(it.price_snapshot);
    const qty = Math.max(1, Math.floor(Number(it.qty) || 1));
    const subtotal = money(it.subtotal) || unitPrice * qty;
    return {
      title: text(it.product_title_snapshot) || "상품",
      options: orderLineOptionsSummary(it.options_snapshot_json),
      unitPrice,
      qty,
      subtotal,
    };
  });
  const itemsSubtotal = items.reduce((sum, it) => sum + it.subtotal, 0);
  const deliveryFee = money(order.delivery_fee_amount);
  const paymentTotal = money(order.payment_amount ?? order.total_amount);
  const rawDiscount = money(order.discount_amount);
  const inferredDiscount = Math.max(0, itemsSubtotal + deliveryFee - paymentTotal);
  const discount = rawDiscount > 0 ? rawDiscount : inferredDiscount;
  const orderCreatedAt = nullableText(order.created_at);

  return {
    orderId: text(order.id),
    orderNo: text(order.order_no),
    storeName: input.storeName || text(order.store_name) || "매장",
    status,
    statusLabel: BUYER_ORDER_STATUS_LABEL[status] ?? status,
    fulfillmentType,
    fulfillmentLabel: isDeliveryFulfillment(fulfillmentType) ? "배달" : "포장·픽업",
    isDelivery: isDeliveryFulfillment(fulfillmentType),
    createdAt: orderCreatedAt,
    acceptedAt: nullableText(order.accepted_at),
    estimatedPrepMinutes: nullableInt(order.estimated_prep_minutes),
    estimatedReadyAt: nullableText(order.estimated_ready_at),
    addressLines: buildAddressLines(input, fulfillmentType),
    buyerPhone: nullableText(order.buyer_phone),
    buyerNote: nullableText(order.buyer_note ?? order.delivery_note),
    paymentMethodLabel: paymentMethodLabel(order),
    items,
    totals: {
      itemsSubtotal,
      deliveryFee,
      discount,
      paymentTotal,
    },
    timeline: buildStoreOrderSummaryTimelineSteps({
      fulfillmentType,
      orderStatus: status,
      orderCreatedAt,
      statusEvents: input.events ?? [],
    }),
  };
}
