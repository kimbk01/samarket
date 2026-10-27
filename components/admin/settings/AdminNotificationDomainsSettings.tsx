"use client";

import { AdminPageHeader } from "@/components/admin/AdminPageHeader";
import { AdminNotificationSoundSsotTable } from "@/components/admin/settings/AdminNotificationSoundSsotTable";
import { AdminOpsSoundPreferenceToggle } from "@/components/admin/settings/AdminOpsSoundPreferenceToggle";

export function AdminNotificationDomainsSettings() {
  return (
    <div className="space-y-4">
      <AdminPageHeader titleKey="admin_menu_settings_notifications" />
      <AdminOpsSoundPreferenceToggle />
      <AdminNotificationSoundSsotTable />
    </div>
  );
}
