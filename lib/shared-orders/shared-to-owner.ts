import type { BuyerCancelRequest, OwnerOrder, OwnerOrderItem, OwnerOrderLog, OwnerOrderStatus } from "@/lib/store-owner/types";
import { telHrefFromLoosePhPhone } from "@/lib/utils/ph-mobile";
import type { SharedOrder, SharedOrderLog } from "./types";

function actorForOwner(sl: SharedOrderLog): OwnerOrderLog["actor_type"] {
  if (sl.actor_type === "owner") return "owner";
  if (sl.actor_type === "member") return "buyer";
  return "system";
}

function logToOwner(o: SharedOrder, sl: SharedOrderLog): OwnerOrderLog {
  return {
    id: sl.id,
    order_id: o.id,
    from_status: sl.from_status as OwnerOrderStatus | null,
    to_status: sl.to_status as OwnerOrderStatus | null,
    actor_type: actorForOwner(sl),
    actor_name: sl.actor_name,
    message: sl.message,
    created_at: sl.created_at,
  };
}

function itemToOwner(it: SharedOrder["items"][0]): OwnerOrderItem {
  return {
    id: it.id,
    menu_name: it.menu_name,
    options_summary: it.options_summary,
    qty: it.qty,
    line_total: it.line_total,
  };
}

export function sharedOrderToOwner(o: SharedOrder): OwnerOrder {
  const addr = o.delivery_address_summary?.trim() ? o.delivery_address_summary.trim() : null;

  const buyerCancel: BuyerCancelRequest | null =
    o.order_status === "cancel_requested" && o.cancel_request_status === "pending"
      ? {
          reason: o.cancel_request_reason ?? "",
          requested_at: o.updated_at,
        }
      : null;

  return {
    id: o.id,
    order_no: o.order_no,
    store_id: o.store_id,
    store_slug: o.store_slug,
    store_name: o.store_name,
    buyer_name: o.buyer_name,
    buyer_phone: o.buyer_phone,
    buyer_phone_tel_href: telHrefFromLoosePhPhone(o.buyer_phone),
    order_type: o.order_type,
    order_status: o.order_status as OwnerOrderStatus,
    product_amount: o.product_amount,
    option_amount: o.option_amount,
    delivery_fee: o.delivery_fee,
    total_amount: o.final_amount,
    request_message: o.request_message,
    delivery_address: addr,
    pickup_note: o.pickup_note,
    created_at: o.created_at,
    updated_at: o.updated_at,
    items: o.items.map(itemToOwner),
    logs: o.logs.map((sl) => logToOwner(o, sl)),
    buyer_cancel_request: buyerCancel,
    problem_memo: o.dispute_memo,
    cancel_reason: o.cancel_reason,
  };
}
