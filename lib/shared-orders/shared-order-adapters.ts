import type {
  AdminDeliveryOrder,
  AdminDeliveryOrderItem,
  AdminDeliverySettlement,
  OrderStatus,
  OrderStatusLog,
} from "@/lib/admin/delivery-orders-mock/types";
import type { SharedOrder, SharedOrderLog } from "./types";

function itemToAdmin(it: SharedOrder["items"][0]): AdminDeliveryOrderItem {
  const qty = Math.max(1, it.qty);
  return {
    id: it.id,
    menuName: it.menu_name,
    options: [{ optionGroupName: "옵션", optionName: it.options_summary, optionPrice: 0 }],
    qty: it.qty,
    unitPrice: Math.round(it.line_total / qty),
    optionExtra: 0,
    lineTotal: it.line_total,
  };
}

function settlementToAdmin(s: NonNullable<SharedOrder["settlement"]>): AdminDeliverySettlement {
  return {
    id: s.id,
    grossAmount: s.gross_amount,
    feeAmount: s.fee_amount,
    settlementAmount: s.settlement_amount,
    settlementStatus: s.settlement_status,
    holdReason: s.hold_reason,
    paidAt: s.paid_at,
    scheduledDate: s.scheduled_date,
  };
}

export function sharedOrderToAdminDelivery(o: SharedOrder): AdminDeliveryOrder {
  const cancelRequest =
    o.order_status === "cancel_requested" && o.cancel_request_status === "pending"
      ? {
          reason: o.cancel_request_reason ?? "",
          requestedAt: o.updated_at,
          status: "pending" as const,
        }
      : o.cancel_request_status === "approved" || o.cancel_request_status === "rejected"
        ? {
            reason: o.cancel_request_reason ?? "",
            requestedAt: o.created_at,
            status: o.cancel_request_status,
          }
        : null;

  return {
    id: o.id,
    orderNo: o.order_no,
    buyerUserId: o.buyer_user_id,
    buyerName: o.buyer_name,
    buyerPhone: o.buyer_phone,
    storeId: o.store_id,
    storeName: o.store_name,
    storeSlug: o.store_slug,
    storeOwnerUserId: o.owner_user_id,
    storeOwnerName: o.owner_name,
    orderType: o.order_type === "delivery" ? "delivery" : "pickup",
    addressSummary: o.delivery_address_summary ?? undefined,
    addressDetail: o.delivery_address_detail ?? undefined,
    pickupNote: o.pickup_note ?? undefined,
    requestNote: o.request_message ?? undefined,
    items: o.items.map(itemToAdmin),
    productAmount: o.product_amount,
    optionAmount: o.option_amount,
    deliveryFee: o.delivery_fee,
    discountAmount: o.discount_amount,
    finalAmount: o.final_amount,
    paymentStatus: o.payment_status,
    orderStatus: o.order_status as OrderStatus,
    settlementStatus: o.settlement_status,
    adminActionStatus: o.admin_action_status,
    cancelReason: o.cancel_reason ?? undefined,
    refundReason: o.refund_reason ?? undefined,
    adminMemo: o.admin_memo,
    hasReport: o.has_report,
    disputeMemo: o.dispute_memo ?? undefined,
    createdAt: o.created_at,
    updatedAt: o.updated_at,
    settlement: o.settlement ? settlementToAdmin(o.settlement) : undefined,
    cancelRequest,
    refundRequest: o.refund_request
      ? {
          reason: o.refund_request.reason,
          category: o.refund_request.category,
          requestedBy:
            o.refund_request.requested_by === "member"
              ? "buyer"
              : o.refund_request.requested_by === "owner"
                ? "store"
                : "admin",
          requestedAt: o.refund_request.requested_at,
          status: o.refund_request.status,
        }
      : null,
    orderSource: "simulation",
  };
}

export function sharedLogToAdminTimeline(sl: SharedOrderLog): OrderStatusLog {
  const actorType =
    sl.actor_type === "member" ? "buyer" : sl.actor_type === "owner" ? "store" : sl.actor_type;
  return {
    id: sl.id,
    orderId: sl.order_id,
    actorType,
    actorId: sl.actor_name,
    action: sl.message,
    fromOrderStatus: sl.from_status ?? undefined,
    toOrderStatus: sl.to_status ?? undefined,
    reason: sl.message,
    createdAt: sl.created_at,
  };
}

export function adminLogsForOrder(o: SharedOrder): OrderStatusLog[] {
  return [...o.logs].map(sharedLogToAdminTimeline).sort(
    (a, b) => new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime()
  );
}
