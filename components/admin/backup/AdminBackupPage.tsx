"use client";

import { useEffect, useState } from "react";
import { useI18n } from "@/components/i18n/AppLanguageProvider";
import { AdminPageHeader } from "@/components/admin/AdminPageHeader";
import { AdminCard } from "@/components/admin/AdminCard";
import { BackupSnapshotTable } from "./BackupSnapshotTable";
import { RestoreSimulationCard } from "./RestoreSimulationCard";
import { loadBackupFromServer } from "@/lib/backup/backup-sync-client";

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
        <AdminPageHeader titleKey="admin_page_backup_restore" />
        <AdminCard>
          <p className="py-8 text-center sam-text-body text-sam-muted">
            {t("admin_loading_ops_settings")}
          </p>
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
      <AdminPageHeader titleKey="admin_page_backup_restore" />
      {hydrateError ? (
        <div
          className="mb-4 rounded-ui-rect border border-amber-500/40 bg-amber-500/10 px-4 py-3 sam-text-body-secondary text-sam-fg"
          role="alert"
        >
          서버에서 백업 설정을 불러오지 못했습니다. 기본값으로 표시 중입니다. ({hydrateError})
        </div>
      ) : null}
      <div className="mb-4 flex flex-wrap gap-1 border-b border-sam-border">
        {tabs.map((tab) => (
          <button
            key={tab.id}
            type="button"
            onClick={() => setActiveTab(tab.id)}
            className={`border-b-2 px-3 py-2 sam-text-body font-medium ${
              activeTab === tab.id
                ? "border-signature text-signature"
                : "border-transparent text-sam-muted hover:text-sam-fg"
            }`}
          >
            {tab.label}
          </button>
        ))}
      </div>
      {activeTab === "list" && (
        <div className="space-y-4">
          <div className="flex items-center gap-2">
            <button
              type="button"
              className="rounded border border-signature bg-signature/10 px-3 py-2 sam-text-body font-medium text-signature hover:bg-signature/20"
            >
              {t("admin_backup_run_mock")}
            </button>
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
