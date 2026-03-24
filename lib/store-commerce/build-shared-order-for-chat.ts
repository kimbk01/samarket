import type { SharedOrder, SharedOrderItem, SharedOrderType } from "@/lib/shared-orders/types";
import { orderLineOptionsSummary } from "@/lib/stores/product-line-options";
import { storeOrderStatusToShared } from "./map-order-status";

type StoreOrderRow = {
  id: string;
  order_no: string;
  store_id: string;
  store_name: string;
  store_slug: string;
  owner_user_id: string;
  buyer_user_id: string;
  total_amount: number;
  discount_amount?: number;
  payment_amount: number;
  delivery_fee_amount?: number | null;
  payment_status: string;
  order_status: string;
  fulfillment_type: string;
  buyer_note: string | null;
  buyer_phone?: string | null;
  created_at: string;
  updated_at?: string;
};

type ItemRow = {
  id: string;
  product_title_snapshot: string;
  price_snapshot: number;
  qty: number;
  subtotal: number;
  options_snapshot_json?: unknown;
};

function fulfillmentToOrderType(ft: string): SharedOrderType {
  if (ft === "local_delivery") return "delivery";
  return "pickup";
}

/** 채팅·시스템 메시지용 SharedOrder 스텁 (샘플 shared-order-chat과 동일 API) */
export function buildSharedOrderForStoreCommerceChat(p: {
  order: StoreOrderRow;
  items: ItemRow[];
  buyerDisplayName: string;
  ownerDisplayName: string;
}): SharedOrder {
  const { order, items, buyerDisplayName, ownerDisplayName } = p;
  const st = storeOrderStatusToShared(order.order_status) ?? "pending";
  const pay = String(order.payment_status ?? "pending") as SharedOrder["payment_status"];
  const itemsMapped: SharedOrderItem[] = items.map((it) => ({
    id: it.id,
    menu_name: it.product_title_snapshot,
    options_summary: orderLineOptionsSummary(it.options_snapshot_json) || "—",
    qty: it.qty,
    line_total: Math.round(it.subtotal),
  }));

  const created = order.created_at;
  const updated = order.updated_at ?? created;

  return {
    id: order.id,
    order_no: order.order_no,
    store_id: order.store_id,
    store_name: order.store_name,
    store_slug: order.store_slug,
    owner_user_id: order.owner_user_id,
    owner_name: ownerDisplayName,
    buyer_user_id: order.buyer_user_id,
    buyer_name: buyerDisplayName,
    buyer_phone: order.buyer_phone ?? "",
    order_type: fulfillmentToOrderType(order.fulfillment_type),
    order_status: st,
    payment_status: pay === "paid" || pay === "pending" || pay === "failed" || pay === "cancelled" || pay === "refunded" ? pay : "pending",
    settlement_status: "scheduled",
    admin_action_status: "none",
    product_amount: Math.round(order.payment_amount - (order.delivery_fee_amount ?? 0)),
    option_amount: 0,
    delivery_fee: Math.round(Number(order.delivery_fee_amount) || 0),
    discount_amount: Math.round(Number(order.discount_amount) || 0),
    total_amount: Math.round(order.total_amount),
    final_amount: Math.round(order.payment_amount),
    request_message: order.buyer_note,
    delivery_address_summary: null,
    delivery_address_detail: null,
    pickup_note: null,
    cancel_request_reason: null,
    cancel_request_status: "none",
    cancel_reason: null,
    refund_reason: null,
    refund_request: null,
    admin_memo: "",
    has_report: false,
    dispute_memo: null,
    settlement: null,
    items: itemsMapped,
    logs: [],
    created_at: created,
    updated_at: updated,
  };
}
