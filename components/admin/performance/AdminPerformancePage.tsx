"use client";

import { useAdminSyncLoad } from "@/components/admin/useAdminSyncLoad";
import { AdminSyncLoadGate } from "@/components/admin/AdminSyncLoadGate";
import { AdminPageHeader } from "@/components/admin/AdminPageHeader";
import { AdminCard } from "@/components/admin/AdminCard";
import { PerformanceSummaryCards } from "./PerformanceSummaryCards";
import { SlowApiTable } from "./SlowApiTable";
import { SlowQueryTable } from "./SlowQueryTable";
import { loadPerformanceOpsFromServer } from "@/lib/performance/performance-ops-sync-client";

export function AdminPerformancePage() {
  const { state: loadState, reload } = useAdminSyncLoad(loadPerformanceOpsFromServer);
  const hydrated = loadState.status === "ready";

  if (!hydrated) {
    return (
      <>
        <AdminPageHeader titleKey="admin_menu_dev_performance" />
        <AdminSyncLoadGate state={loadState} onRetry={reload} />
      </>
    );
  }

  return (
    <>
      <AdminPageHeader titleKey="admin_menu_dev_performance" />
      <div className="space-y-4">
        <AdminCard titleKey="admin_performance_status_3">
          <PerformanceSummaryCards />
        </AdminCard>
        <AdminCard titleKey="admin_performance_ke743d657">
          <SlowApiTable />
        </AdminCard>
        <AdminCard titleKey="admin_performance_kdcf01eac">
          <SlowQueryTable />
        </AdminCard>
      </div>
    </>
  );
}
