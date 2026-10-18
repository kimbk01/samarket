import type { MessageKey } from "@/lib/i18n/messages";
import type { StoreOrderStatus } from "@/lib/stores/order-status-transitions";

/** Admin order status labels (ko/en catalog) — shared by the order list and order detail. */
export const ADMIN_STORE_ORDER_STATUS_LABEL_KEYS: Record<StoreOrderStatus, MessageKey> = {
  pending: "admin_stores_orders_status_pending",
  accepted: "admin_stores_orders_status_accepted",
  preparing: "admin_stores_orders_status_preparing",
  ready_for_pickup: "admin_stores_orders_status_ready_for_pickup",
  delivering: "admin_stores_orders_status_delivering",
  arrived: "admin_stores_orders_status_arrived",
  completed: "admin_stores_orders_status_completed",
  cancel_requested: "admin_stores_orders_status_cancel_requested",
  cancelled: "admin_stores_orders_status_cancelled",
  refund_requested: "admin_stores_orders_status_refund_requested",
  refunded: "admin_stores_orders_status_refunded",
};
