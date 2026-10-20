"use client";

import { useAdminSyncLoad } from "@/components/admin/useAdminSyncLoad";
import { AdminSyncLoadGate } from "@/components/admin/AdminSyncLoadGate";
import { AdminPageHeader } from "@/components/admin/AdminPageHeader";
import { AdminCard } from "@/components/admin/AdminCard";
import { UsageCostCards } from "./UsageCostCards";
import { loadUsageOpsFromServer } from "@/lib/usage/usage-ops-sync-client";

export function AdminUsagePage() {
  const { state: loadState, reload } = useAdminSyncLoad(loadUsageOpsFromServer);
  const hydrated = loadState.status === "ready";

  if (!hydrated) {
    return (
      <>
        <AdminPageHeader titleKey="admin_menu_dev_usage" />
        <AdminSyncLoadGate state={loadState} onRetry={reload} />
      </>
    );
  }

  return (
    <>
      <AdminPageHeader titleKey="admin_menu_dev_usage" />
      <AdminCard titleKey="admin_usage_card_title">
        <UsageCostCards />
      </AdminCard>
    </>
  );
}
