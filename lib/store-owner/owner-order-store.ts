/**
 * 오너 UI facade — 원본: @/lib/shared-orders/shared-order-store
 */
import {
  findSharedOrder,
  getSharedOrdersVersion,
  listSharedOrdersRaw,
  resetSharedOrders,
  sharedOwnerAccept,
  sharedOwnerAcknowledgeCancel,
  sharedOwnerComplete,
  sharedOwnerMarkArrived,
  sharedOwnerMarkPickupReady,
  sharedOwnerMarkProblem,
  sharedOwnerReject,
  sharedOwnerStartDelivery,
  sharedOwnerStartPreparing,
  subscribeSharedOrders,
} from "@/lib/shared-orders/shared-order-store";
import { sharedOrderToOwner } from "@/lib/shared-orders/shared-to-owner";
import type { OwnerOrder, OwnerOrderTab } from "./types";

function clone<T>(x: T): T {
  return JSON.parse(JSON.stringify(x)) as T;
}

export const subscribeOwnerOrders = subscribeSharedOrders;
export const getOwnerOrdersVersion = getSharedOrdersVersion;

export function listOwnerOrdersForStore(storeId: string): OwnerOrder[] {
  return listSharedOrdersRaw()
    .filter((o) => o.store_id === storeId)
    .map(sharedOrderToOwner)
    .map(clone);
}

export function getOwnerOrder(storeId: string, orderId: string): OwnerOrder | undefined {
  const o = findSharedOrder(orderId);
  if (!o || o.store_id !== storeId) return undefined;
  return clone(sharedOrderToOwner(o));
}

export function filterOwnerOrdersByTab(ordersList: OwnerOrder[], tab: OwnerOrderTab): OwnerOrder[] {
  return ordersList.filter((o) => {
    const s = o.order_status;
    switch (tab) {
      case "all":
        return true;
      case "new":
        return s === "pending";
      case "active":
        return ["accepted", "preparing", "delivering", "ready_for_pickup", "arrived"].includes(s);
      case "done":
        return s === "completed";
      case "issue":
        return ["cancelled", "refund_requested", "refunded", "cancel_requested"].includes(s);
      default:
        return true;
    }
  });
}

export function getSuggestedNextStatus(o: OwnerOrder): import("./types").OwnerOrderStatus | null {
  const { order_type: t, order_status: s } = o;
  if (s === "pending") return "accepted";
  if (s === "accepted") return "preparing";
  if (s === "preparing") return "ready_for_pickup";
  if (s === "ready_for_pickup") return t === "delivery" ? "delivering" : "completed";
  if (s === "delivering") return "arrived";
  if (s === "arrived") return "completed";
  return null;
}

export function ownerAcceptOrder(storeId: string, orderId: string) {
  const o = findSharedOrder(orderId);
  if (!o || o.store_id !== storeId) return { ok: false as const, error: "주문 없음" };
  return sharedOwnerAccept(orderId);
}

export function ownerRejectOrder(storeId: string, orderId: string, reason: string) {
  const o = findSharedOrder(orderId);
  if (!o || o.store_id !== storeId) return { ok: false as const, error: "주문 없음" };
  return sharedOwnerReject(orderId, reason);
}

export function ownerSetPreparing(storeId: string, orderId: string) {
  const o = findSharedOrder(orderId);
  if (!o || o.store_id !== storeId) return { ok: false as const, error: "주문 없음" };
  return sharedOwnerStartPreparing(orderId);
}

export function ownerSetDelivering(storeId: string, orderId: string) {
  const o = findSharedOrder(orderId);
  if (!o || o.store_id !== storeId) return { ok: false as const, error: "주문 없음" };
  return sharedOwnerStartDelivery(orderId);
}

export function ownerSetArrived(storeId: string, orderId: string) {
  const o = findSharedOrder(orderId);
  if (!o || o.store_id !== storeId) return { ok: false as const, error: "주문 없음" };
  return sharedOwnerMarkArrived(orderId);
}

export function ownerSetPickupReady(storeId: string, orderId: string) {
  const o = findSharedOrder(orderId);
  if (!o || o.store_id !== storeId) return { ok: false as const, error: "주문 없음" };
  return sharedOwnerMarkPickupReady(orderId);
}

export function ownerCompleteOrder(storeId: string, orderId: string) {
  const o = findSharedOrder(orderId);
  if (!o || o.store_id !== storeId) return { ok: false as const, error: "주문 없음" };
  return sharedOwnerComplete(orderId);
}

export function ownerMarkProblemOrder(storeId: string, orderId: string, memo: string) {
  const o = findSharedOrder(orderId);
  if (!o || o.store_id !== storeId) return { ok: false as const, error: "주문 없음" };
  return sharedOwnerMarkProblem(orderId, memo);
}

export function ownerDismissCancelRequest(storeId: string, orderId: string) {
  const o = findSharedOrder(orderId);
  if (!o || o.store_id !== storeId) return { ok: false as const, error: "주문 없음" };
  return sharedOwnerAcknowledgeCancel(orderId);
}

export function resetOwnerOrdersMock() {
  resetSharedOrders();
}
