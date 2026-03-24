import { formatBuyerPaymentDisplay } from "@/lib/stores/payment-methods-config";
import { orderLineOptionsSummary } from "@/lib/stores/product-line-options";
import type {
  AdminDeliveryOrder,
  AdminDeliveryOrderItem,
  PaymentStatus,
  OrderStatus,
} from "@/lib/admin/delivery-orders-mock/types";

export type StoreOrderRow = {
  id: string;
  order_no: string;
  buyer_user_id: string;
  store_id: string;
  total_amount: number;
  discount_amount?: number;
  payment_amount: number;
  delivery_fee_amount?: number | null;
  payment_status: string;
  order_status: string;
  fulfillment_type: string;
  buyer_note?: string | null;
  buyer_phone?: string | null;
  buyer_payment_method?: string | null;
  buyer_payment_method_detail?: string | null;
  delivery_address_summary?: string | null;
  delivery_address_detail?: string | null;
  created_at: string;
  updated_at?: string;
  auto_complete_at?: string | null;
};

export type StoreOrderItemRow = {
  id: string;
  product_title_snapshot: string;
  price_snapshot: number;
  qty: number;
  subtotal: number;
  options_snapshot_json?: unknown;
};

function fulfillmentToOrderType(ft: string): "delivery" | "pickup" {
  return ft === "pickup" ? "pickup" : "delivery";
}

function mapItem(it: StoreOrderItemRow): AdminDeliveryOrderItem {
  const qty = Math.max(1, Math.floor(Number(it.qty) || 1));
  const optLine = orderLineOptionsSummary(it.options_snapshot_json);
  return {
    id: it.id,
    menuName: it.product_title_snapshot,
    options: [{ optionGroupName: "옵션", optionName: optLine || "—", optionPrice: 0 }],
    qty,
    unitPrice: qty > 0 ? Math.round(Number(it.subtotal) / qty) : 0,
    optionExtra: 0,
    lineTotal: Math.round(Number(it.subtotal) || 0),
  };
}

/**
 * Supabase store_orders + 주변 메타 → 관리자 배달 주문 표 형식 (시뮬 행과 동일 테이블에 병합용)
 */
export function mapStoreOrderToAdminDelivery(p: {
  order: StoreOrderRow;
  items: StoreOrderItemRow[];
  storeName: string;
  storeSlug: string;
  storeOwnerUserId: string;
  storeOwnerName: string;
  buyerDisplayName: string;
}): AdminDeliveryOrder {
  const o = p.order;
  const payDisp = formatBuyerPaymentDisplay(o.buyer_payment_method, o.buyer_payment_method_detail);
  const items = p.items.map(mapItem);
  const productAmount = items.reduce((s, it) => s + it.lineTotal, 0);
  const deliveryFee = Math.max(0, Math.round(Number(o.delivery_fee_amount) || 0));
  const discountAmount = Math.max(0, Math.round(Number(o.discount_amount) || 0));

  return {
    id: o.id,
    orderNo: o.order_no,
    buyerUserId: o.buyer_user_id,
    buyerName: p.buyerDisplayName,
    buyerPhone: (o.buyer_phone ?? "").trim() || "—",
    storeId: o.store_id,
    storeName: p.storeName || "매장",
    storeSlug: p.storeSlug,
    storeOwnerUserId: p.storeOwnerUserId,
    storeOwnerName: p.storeOwnerName || "—",
    orderType: fulfillmentToOrderType(o.fulfillment_type),
    addressSummary: o.delivery_address_summary ?? undefined,
    addressDetail: o.delivery_address_detail ?? undefined,
    requestNote: o.buyer_note ?? undefined,
    buyerCheckoutPaymentMethod: payDisp === "—" ? undefined : payDisp,
    items,
    productAmount,
    optionAmount: 0,
    deliveryFee,
    discountAmount,
    finalAmount: Math.round(Number(o.payment_amount) || 0),
    paymentStatus: o.payment_status as PaymentStatus,
    orderStatus: o.order_status as OrderStatus,
    settlementStatus: "scheduled",
    adminActionStatus: "none",
    adminMemo: "",
    hasReport: false,
    createdAt: o.created_at,
    updatedAt: o.updated_at ?? o.created_at,
    orderSource: "store_db",
  };
}
