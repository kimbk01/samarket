/**
 * Owner orders meta chip counts — `state.orders` derive.
 * 서버 `countPendingAcceptForStore` · `countPendingDeliveryAcceptForStore` · `countRefundRequestedForStore` 와 동일 조건.
 */
export type OwnerStoreOrderMetaCountRow = {
  order_status: string;
  fulfillment_type: string;
};

export type OwnerStoreOrderMetaCounts = {
  pendingAcceptCount: number;
  pendingDeliveryCount: number;
  refundRequestedCount: number;
};

export function deriveOwnerStoreOrderMetaCounts(
  orders: readonly OwnerStoreOrderMetaCountRow[]
): OwnerStoreOrderMetaCounts {
  let pendingAcceptCount = 0;
  let pendingDeliveryCount = 0;
  let refundRequestedCount = 0;
  for (const o of orders) {
    const status = String(o.order_status ?? "");
    if (status === "pending") {
      pendingAcceptCount += 1;
      if (String(o.fulfillment_type ?? "") === "local_delivery") {
        pendingDeliveryCount += 1;
      }
    }
    if (status === "refund_requested") {
      refundRequestedCount += 1;
    }
  }
  return { pendingAcceptCount, pendingDeliveryCount, refundRequestedCount };
}
