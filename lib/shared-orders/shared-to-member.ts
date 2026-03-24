import type { MemberOrder, MemberOrderItem, MemberOrderLog, MemberOrderStatus } from "@/lib/member-orders/types";
import type { SharedOrder, SharedOrderLog } from "./types";

function logToMember(o: SharedOrder, sl: SharedOrderLog): MemberOrderLog {
  return {
    id: sl.id,
    order_id: o.id,
    status: (sl.to_status ?? o.order_status) as MemberOrderStatus,
    message: sl.message,
    created_at: sl.created_at,
  };
}

function itemToMember(it: SharedOrder["items"][0]): MemberOrderItem {
  return {
    id: it.id,
    menu_name: it.menu_name,
    options_summary: it.options_summary,
    qty: it.qty,
    line_total: it.line_total,
  };
}

export function sharedOrderToMember(o: SharedOrder): MemberOrder {
  return {
    id: o.id,
    order_no: o.order_no,
    buyer_user_id: o.buyer_user_id,
    store_id: o.store_id,
    store_name: o.store_name,
    store_slug: o.store_slug,
    order_type: o.order_type,
    order_status: o.order_status as MemberOrderStatus,
    payment_status: o.payment_status,
    product_amount: o.product_amount,
    option_amount: o.option_amount,
    delivery_fee: o.delivery_fee,
    total_amount: o.final_amount,
    request_message: o.request_message,
    delivery_address_summary: o.delivery_address_summary,
    delivery_address_detail: o.delivery_address_detail,
    buyer_phone: o.buyer_phone,
    pickup_note: o.pickup_note,
    created_at: o.created_at,
    updated_at: o.updated_at,
    items: o.items.map(itemToMember),
    logs: o.logs.map((sl) => logToMember(o, sl)),
    cancel_request_reason: o.cancel_request_reason,
  };
}
