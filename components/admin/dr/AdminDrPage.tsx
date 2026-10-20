"use client";

import { AdminPageHeader } from "@/components/admin/AdminPageHeader";
import { AdminCard } from "@/components/admin/AdminCard";
import { DrScenarioTable } from "./DrScenarioTable";
import { loadDrOpsFromServer } from "@/lib/dr/dr-sync-client";
import { AdminActionButton } from "@/components/admin/ui/AdminActionButton";
import { useAdminSyncLoad } from "@/components/admin/useAdminSyncLoad";
import { AdminSyncLoadGate } from "@/components/admin/AdminSyncLoadGate";

export function AdminDrPage() {
  const { state: loadState, reload } = useAdminSyncLoad(loadDrOpsFromServer);

  if (loadState.status !== "ready") {
    return (
      <>
        <AdminPageHeader titleKey="admin_menu_dev_dr" />
        <AdminSyncLoadGate state={loadState} onRetry={reload} />
      </>
    );
  }

  return (
    <>
      <AdminPageHeader titleKey="admin_menu_dev_dr" />
      <div className="mb-4 flex items-center gap-2">
        <AdminActionButton variant="secondary">
          리허설 실행 (mock)
        </AdminActionButton>
        <span className="sam-text-helper text-sam-muted">
          시나리오 선택 후 상세에서 단계별 실행
        </span>
      </div>
      <AdminCard titleKey="admin_dr_kef082268">
        <DrScenarioTable />
      </AdminCard>
    </>
  );
}
