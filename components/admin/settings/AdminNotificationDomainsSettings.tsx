"use client";

import { AdminPageHeader } from "@/components/admin/AdminPageHeader";
import { AdminNotificationSoundSsotTable } from "@/components/admin/settings/AdminNotificationSoundSsotTable";

export function AdminNotificationDomainsSettings() {
  return (
    <div className="space-y-4">
      <AdminPageHeader titleKey="admin_settings_notifications_domain_title" />
      <AdminNotificationSoundSsotTable />
    </div>
  );
}
