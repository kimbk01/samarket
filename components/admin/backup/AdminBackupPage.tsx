"use client";

import { useI18n } from "@/components/i18n/AppLanguageProvider";
import { AdminPageHeader } from "@/components/admin/AdminPageHeader";
import { AdminCard } from "@/components/admin/AdminCard";
import { BackupSnapshotTable } from "./BackupSnapshotTable";
import { RestoreSimulationCard } from "./RestoreSimulationCard";
import { loadBackupFromServer } from "@/lib/backup/backup-sync-client";
import { AdminTabs } from "@/components/admin/ui/AdminTabs";
import { AdminActionButton } from "@/components/admin/ui/AdminActionButton";
import { useAdminSyncLoad } from "@/components/admin/useAdminSyncLoad";
import { AdminSyncLoadGate } from "@/components/admin/AdminSyncLoadGate";
import { adminSyncTabResetParams, useAdminUrlTab } from "@/components/admin/sync-list/useAdminUrlTab";

type TabId = "list" | "restore";

export function AdminBackupPage() {
  const { t } = useI18n();
  /** 탭은 주소(`?tab=`)에 보존 — 목록 조건과 함께 새로고침·링크 공유·상세 복귀 시 유지 (R7). */
  const activeTab = useAdminUrlTab<TabId>(["list", "restore"] as const, "list");
  const { state: loadState, reload } = useAdminSyncLoad(loadBackupFromServer);

  if (loadState.status !== "ready") {
    return (
      <>
        <AdminPageHeader titleKey="admin_menu_dev_backup" />
        <AdminSyncLoadGate state={loadState} onRetry={reload} />
      </>
    );
  }

  const tabs: { id: TabId; label: string }[] = [
    { id: "list", label: t("admin_backup_tab_list") },
    { id: "restore", label: t("admin_backup_tab_restore_sim") },
  ];

  return (
    <>
      <AdminPageHeader titleKey="admin_menu_dev_backup" />
      <AdminTabs
        className="mb-4"
        tabs={tabs.map((tab) => ({ id: tab.id, label: tab.label }))}
        ariaLabel="화면 탭"
        defaultValue="list"
        resetParams={adminSyncTabResetParams(["type"])}
      />
      {activeTab === "list" && (
        <div className="space-y-4">
          <div className="flex items-center gap-2">
            {/* 실제 백업 실행 API 없음(mock) — 누를 수 있는 것처럼 보이지 않게 비활성 */}
            <AdminActionButton variant="secondary" disabled aria-disabled="true">
              {t("admin_backup_run_mock")}
            </AdminActionButton>
            <span className="sam-text-helper text-sam-muted">
              manual / scheduled / pre-release / emergency
            </span>
          </div>
          <AdminCard titleKey="admin_backup_card_snapshots">
            <BackupSnapshotTable />
          </AdminCard>
        </div>
      )}
      {activeTab === "restore" && (
        <AdminCard titleKey="admin_backup_card_restore_sim_log">
          <RestoreSimulationCard />
        </AdminCard>
      )}
    </>
  );
}
