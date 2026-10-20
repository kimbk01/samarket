"use client";

import { useEffect, useState } from "react";
import { useI18n } from "@/components/i18n/AppLanguageProvider";
import { AdminPageHeader } from "@/components/admin/AdminPageHeader";
import { AdminCard } from "@/components/admin/AdminCard";
import { BackupSnapshotTable } from "./BackupSnapshotTable";
import { RestoreSimulationCard } from "./RestoreSimulationCard";
import { loadBackupFromServer } from "@/lib/backup/backup-sync-client";
import { AdminTabs } from "@/components/admin/ui/AdminTabs";
import { adminOperatorErrorMessage } from "@/lib/admin/operator-ux/operator-labels";
import { AdminActionButton } from "@/components/admin/ui/AdminActionButton";
import { AdminLoadingState } from "@/components/admin/ui/AdminStateViews";

type TabId = "list" | "restore";

export function AdminBackupPage() {
  const { t } = useI18n();
  const [activeTab, setActiveTab] = useState<TabId>("list");
  const [hydrated, setHydrated] = useState(false);
  const [hydrateError, setHydrateError] = useState<string | null>(null);

  useEffect(() => {
    void loadBackupFromServer().then((r) => {
      if (!r.ok) setHydrateError(r.error ?? "load_failed");
      setHydrated(true);
    });
  }, []);

  if (!hydrated) {
    return (
      <>
        <AdminPageHeader titleKey="admin_menu_dev_backup" />
        <AdminCard>
          <AdminLoadingState ko label={t("admin_loading_ops_settings")} />
        </AdminCard>
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
      {hydrateError ? (
        <div
          className="mb-4 rounded-ui-rect border border-sam-warning bg-sam-warning-soft px-4 py-3 sam-text-body-secondary text-sam-fg"
          role="alert"
        >
          서버에서 백업 설정을 불러오지 못했습니다. 기본값으로 표시 중입니다. ({adminOperatorErrorMessage(hydrateError, true)})
        </div>
      ) : null}
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
