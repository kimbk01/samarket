/**
 * 배달·포장 관리자 목록 필터 — `store_orders` 매핑 행(`AdminDeliveryOrder`)에만 의존.
 */
import type {
  AdminDeliveryOrder,
  OrderListFilters,
  OrderStatus,
} from "@/lib/admin/delivery-orders-admin/types";

function matchesFilters(o: AdminDeliveryOrder, f: OrderListFilters): boolean {
  if (f.orderNoQuery.trim() && !o.orderNo.toLowerCase().includes(f.orderNoQuery.trim().toLowerCase()))
    return false;
  const buyerQ = f.buyerQuery.trim().toLowerCase();
  if (buyerQ) {
    const buyerHay = [o.buyerName, o.buyerPhone, o.buyerUserId].join(" ").toLowerCase();
    if (!buyerHay.includes(buyerQ)) return false;
  }
  const storeQ = f.storeQuery.trim().toLowerCase();
  if (storeQ) {
    const storeHay = [o.storeName, o.storeSlug, o.storeId, o.storeOwnerName, o.storeOwnerUserId]
      .join(" ")
      .toLowerCase();
    if (!storeHay.includes(storeQ)) return false;
  }
  if (f.pipelineBucket === "in_progress") {
    const ing: OrderStatus[] = ["accepted", "preparing", "ready_for_pickup", "delivering", "arrived"];
    if (!ing.includes(o.orderStatus)) return false;
  } else if (f.pipelineBucket === "issues") {
    const iss: OrderStatus[] = ["cancel_requested", "cancelled", "refund_requested", "refunded"];
    if (!iss.includes(o.orderStatus)) return false;
  }
  if (f.orderStatus && o.orderStatus !== f.orderStatus) return false;
  if (f.paymentStatus && o.paymentStatus !== f.paymentStatus) return false;
  if (f.settlementStatus && o.settlementStatus !== f.settlementStatus) return false;
  if (f.orderType && o.orderType !== f.orderType) return false;
  if (f.reportsOnly && !o.hasReport) return false;
  if (f.heldSettlementOnly && o.settlementStatus !== "held") return false;
  if (f.dateFrom) {
    const t = new Date(o.createdAt).getTime();
    if (t < new Date(f.dateFrom).getTime()) return false;
  }
  if (f.dateTo) {
    const t = new Date(o.createdAt).getTime();
    const end = new Date(f.dateTo);
    end.setHours(23, 59, 59, 999);
    if (t > end.getTime()) return false;
  }
  return true;
}

export function adminDeliveryOrderMatchesFilters(o: AdminDeliveryOrder, f: OrderListFilters): boolean {
  return matchesFilters(o, f);
}
