import type { SharedOrder } from "@/lib/shared-orders/types";
import { buildOrderNotificationDrafts, type OrderNotifyEvent } from "./notification-message-builder";
import { appendOrderNotificationDrafts } from "./shared-notification-store";

export function emitOrderNotifications(order: SharedOrder, event: OrderNotifyEvent): void {
  const drafts = buildOrderNotificationDrafts(order, event);
  appendOrderNotificationDrafts(drafts);
}
