"use client";

import { useAdminSyncLoad } from "@/components/admin/useAdminSyncLoad";
import { AdminSyncLoadGate } from "@/components/admin/AdminSyncLoadGate";
import { useState } from "react";
import type { MessageKey } from "@/lib/i18n/messages";
import { useI18n } from "@/components/i18n/AppLanguageProvider";
import { AdminPageHeader } from "@/components/admin/AdminPageHeader";
import { AdminCard } from "@/components/admin/AdminCard";
import { AdminTabs } from "@/components/admin/ui/AdminTabs";
import { loadDevSprintsFromServer } from "@/lib/dev-sprints/dev-sprints-sync-client";
import { ReleaseNoteTable } from "./ReleaseNoteTable";
import { PostReleaseCheckTable } from "./PostReleaseCheckTable";
import { ReleaseReadinessCard } from "./ReleaseReadinessCard";

type TabId = "notes" | "post-release" | "readiness";

const TAB_KEYS: { id: TabId; labelKey: MessageKey }[] = [
  { id: "notes", labelKey: "admin_rel_tab_notes" },
  { id: "post-release", labelKey: "admin_rel_tab_post_release" },
  { id: "readiness", labelKey: "admin_rel_tab_readiness" },
];

export function AdminReleaseNotesPage() {
  const { t } = useI18n();
  const [activeTab, setActiveTab] = useState<TabId>("notes");
  const { state: loadState, reload } = useAdminSyncLoad(loadDevSprintsFromServer);
  const hydrated = loadState.status === "ready";

  if (!hydrated) {
    return (
      <>
        <AdminPageHeader titleKey="admin_menu_dev_release_notes" />
        <AdminSyncLoadGate state={loadState} onRetry={reload} />
      </>
    );
  }

  return (
    <>
      <AdminPageHeader titleKey="admin_menu_dev_release_notes" />
      <AdminTabs
        tabs={TAB_KEYS.map((tab) => ({ id: tab.id, label: t(tab.labelKey) }))}
        ariaLabel="화면 탭"
        value={activeTab}
        onChange={(id) => setActiveTab(id as typeof activeTab)}
        syncUrl={false}
        className="mb-4"
      />
      {activeTab === "notes" && (
        <AdminCard titleKey="admin_rel_card_notes_list">
          <ReleaseNoteTable />
        </AdminCard>
      )}
      {activeTab === "post-release" && (
        <AdminCard titleKey="admin_rel_card_post_release">
          <PostReleaseCheckTable />
        </AdminCard>
      )}
      {activeTab === "readiness" && (
        <AdminCard titleKey="admin_rel_card_readiness">
          <ReleaseReadinessCard />
        </AdminCard>
      )}
    </>
  );
}