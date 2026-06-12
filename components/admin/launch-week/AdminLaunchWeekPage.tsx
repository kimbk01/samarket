"use client";

import { useEffect, useState } from "react";
import { useI18n } from "@/components/i18n/AppLanguageProvider";
import type { MessageKey } from "@/lib/i18n/messages";
import { AdminPageHeader } from "@/components/admin/AdminPageHeader";
import { AdminCard } from "@/components/admin/AdminCard";
import { loadLaunchWeekFromServer } from "@/lib/launch-week/launch-week-sync-client";
import { LaunchWeekSummaryCards } from "./LaunchWeekSummaryCards";
import { LaunchWeekKpiTable } from "./LaunchWeekKpiTable";
import { LaunchWeekChecklistTable } from "./LaunchWeekChecklistTable";
import { LaunchWeekIssueBoard } from "./LaunchWeekIssueBoard";
import { LaunchWeekDailyNoteList } from "./LaunchWeekDailyNoteList";
import { LaunchWeekBlockerBoard } from "./LaunchWeekBlockerBoard";

type TabId =
  | "overview"
  | "kpi"
  | "checklist"
  | "issues"
  | "daily"
  | "blocker";

export function AdminLaunchWeekPage() {
  const { t } = useI18n();
  const [activeTab, setActiveTab] = useState<TabId>("overview");
  const [hydrated, setHydrated] = useState(false);

  useEffect(() => {
    void loadLaunchWeekFromServer().then(() => setHydrated(true));
  }, []);

  const tabs: { id: TabId; labelKey: MessageKey }[] = [
    { id: "overview", labelKey: "admin_launch_week_k14765c91" },
    { id: "kpi", labelKey: "admin_launch_week_open_4" },
    { id: "checklist", labelKey: "admin_launch_week_checklist_2" },
    { id: "issues", labelKey: "admin_launch_week_k24f5e606" },
    { id: "daily", labelKey: "admin_launch_week_k01fce460" },
    { id: "blocker", labelKey: "admin_qa_tab_blocker" },
  ];

  if (!hydrated) {
    return (
      <>
        <AdminPageHeader titleKey="admin_launch_week_open_3" />
        <AdminCard>
          <p className="py-8 text-center sam-text-body text-sam-muted">
            {t("admin_rec_mon_loading_settings")}
          </p>
        </AdminCard>
      </>
    );
  }

  return (
    <>
      <AdminPageHeader titleKey="admin_launch_week_open_3" />
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
            {t(tab.labelKey)}
          </button>
        ))}
      </div>

      {activeTab === "overview" && (
        <AdminCard titleKey="admin_launch_week_status_checklist_issues_2">
          <LaunchWeekSummaryCards />
        </AdminCard>
      )}

      {activeTab === "kpi" && (
        <AdminCard titleKey="admin_launch_week_open_4">
          <LaunchWeekKpiTable />
        </AdminCard>
      )}

      {activeTab === "checklist" && (
        <AdminCard titleKey="admin_launch_week_checklist_3">
          <LaunchWeekChecklistTable />
        </AdminCard>
      )}

      {activeTab === "issues" && (
        <AdminCard titleKey="admin_launch_week_critical_issues_2">
          <LaunchWeekIssueBoard />
        </AdminCard>
      )}

      {activeTab === "daily" && (
        <AdminCard titleKey="admin_launch_week_k01fce460">
          <LaunchWeekDailyNoteList />
        </AdminCard>
      )}

      {activeTab === "blocker" && (
        <AdminCard titleKey="admin_launch_week_blocked_checklist_3">
          <LaunchWeekBlockerBoard />
        </AdminCard>
      )}
    </>
  );
}
