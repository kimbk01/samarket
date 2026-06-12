"use client";

import { useEffect, useState } from "react";
import type { MessageKey } from "@/lib/i18n/messages";
import { useI18n } from "@/components/i18n/AppLanguageProvider";
import { AdminPageHeader } from "@/components/admin/AdminPageHeader";
import { AdminCard } from "@/components/admin/AdminCard";
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
  const [hydrated, setHydrated] = useState(false);

  useEffect(() => {
    void loadDevSprintsFromServer().then(() => setHydrated(true));
  }, []);

  if (!hydrated) {
    return (
      <>
        <AdminPageHeader titleKey="admin_rel_page_notes" />
        <AdminCard>
          <p className="py-8 text-center sam-text-body text-sam-muted">{t("admin_rec_mon_loading_settings")}</p>
        </AdminCard>
      </>
    );
  }

  return (
    <>
      <AdminPageHeader titleKey="admin_rel_page_notes" />
      <div className="mb-4 flex flex-wrap gap-1 border-b border-sam-border">
        {TAB_KEYS.map((tab) => (
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
            {t(tab.labelKey)}
          </button>
        ))}
      </div>
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