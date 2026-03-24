import type { SharedOrderStatus } from "@/lib/shared-orders/types";

/** store_orders.order_status → 주문 채팅 시스템 메시지용 SharedOrderStatus */
export function storeOrderStatusToShared(db: string): SharedOrderStatus | null {
  const s = String(db ?? "").trim();
  const allowed: SharedOrderStatus[] = [
    "pending",
    "accepted",
    "preparing",
    "delivering",
    "ready_for_pickup",
    "arrived",
    "completed",
    "cancel_requested",
    "cancelled",
    "refund_requested",
    "refunded",
  ];
  return (allowed as string[]).includes(s) ? (s as SharedOrderStatus) : null;
}
