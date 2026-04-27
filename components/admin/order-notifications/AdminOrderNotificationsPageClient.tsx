"use client";

import { AdminPageHeader } from "@/components/admin/AdminPageHeader";
import { AdminNotificationList } from "@/components/admin/order-notifications/AdminNotificationList";

export function AdminOrderNotificationsPageClient() {
  return (
    <div className="space-y-4 p-4 md:p-6">
      <AdminPageHeader titleKey="admin_order_notifications_title" descriptionKey="admin_order_notifications_desc" />
      <AdminNotificationList />
    </div>
  );
}
