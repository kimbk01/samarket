"use client";

import { useEffect, useState } from "react";
import type { MessageKey } from "@/lib/i18n/messages";
import { useI18n } from "@/components/i18n/AppLanguageProvider";
import { AdminPageHeader } from "@/components/admin/AdminPageHeader";
import { AdminLoadingState } from "@/components/admin/ui/AdminStateViews";
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
  const { t, language } = useI18n();
  const [activeTab, setActiveTab] = useState<TabId>("notes");
  const [hydrated, setHydrated] = useState(false);

  useEffect(() => {
    void loadDevSprintsFromServer().then(() => setHydrated(true));
  }, []);

  if (!hydrated) {
    return (
      <>
        <AdminPageHeader titleKey="admin_menu_dev_release_notes" />
        <AdminLoadingState ko={language === "ko"} label={t("admin_rec_mon_loading_settings")} />
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