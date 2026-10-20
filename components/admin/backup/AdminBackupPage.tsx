"use client";

import { useState } from "react";
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

type TabId = "list" | "restore";

export function AdminBackupPage() {
  const { t } = useI18n();
  const [activeTab, setActiveTab] = useState<TabId>("list");
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
        value={activeTab}
        onChange={(id) => setActiveTab(id as typeof activeTab)}
        syncUrl={false}
      />
      {activeTab === "list" && (
        <div className="space-y-4">
          <div className="flex items-center gap-2">
            <AdminActionButton variant="secondary">
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
