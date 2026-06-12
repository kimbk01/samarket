"use client";

import { useEffect, useState } from "react";
import { useI18n } from "@/components/i18n/AppLanguageProvider";
import type { MessageKey } from "@/lib/i18n/messages";
import { AdminPageHeader } from "@/components/admin/AdminPageHeader";
import { AdminCard } from "@/components/admin/AdminCard";
import { LaunchReadinessSummaryCards } from "./LaunchReadinessSummaryCards";
import { LaunchChecklistTable } from "./LaunchChecklistTable";
import { LaunchAreaBoard } from "./LaunchAreaBoard";
import { LaunchBlockerBoard } from "./LaunchBlockerBoard";
import { LaunchApprovalTable } from "./LaunchApprovalTable";
import { loadLaunchReadinessFromServer } from "@/lib/launch-readiness/launch-readiness-sync-client";

type TabId = "overview" | "checklist" | "area" | "blocker" | "approval";

export function AdminLaunchReadinessPage() {
  const { t } = useI18n();
  const [activeTab, setActiveTab] = useState<TabId>("overview");
  const [hydrated, setHydrated] = useState(false);

  useEffect(() => {
    void loadLaunchReadinessFromServer().then(() => setHydrated(true));
  }, []);

  if (!hydrated) {
    return (
      <>
        <AdminPageHeader titleKey="admin_qa_k2ff62175" />
        <AdminCard>
          <p className="py-8 text-center sam-text-body text-sam-muted">
            {t("admin_rec_mon_loading_settings")}
          </p>
        </AdminCard>
      </>
    );
  }

  const tabs: { id: TabId; labelKey: MessageKey }[] = [
    { id: "overview", labelKey: "admin_launch_readiness_k97156b94" },
    { id: "checklist", labelKey: "admin_launch_week_checklist_2" },
    { id: "area", labelKey: "admin_launch_readiness_k016b426f" },
    { id: "blocker", labelKey: "admin_qa_tab_blocker" },
    { id: "approval", labelKey: "admin_launch_readiness_k0d1cd671" },
  ];

  return (
    <>
      <AdminPageHeader titleKey="admin_qa_k2ff62175" />
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
        <AdminCard titleKey="admin_launch_readiness_area_done_summary_2">
          <LaunchReadinessSummaryCards />
        </AdminCard>
      )}

      {activeTab === "checklist" && (
        <AdminCard titleKey="admin_launch_readiness_all_checklist_2">
          <LaunchChecklistTable />
        </AdminCard>
      )}

      {activeTab === "area" && (
        <AdminCard titleKey="admin_launch_readiness_area_3">
          <LaunchAreaBoard />
        </AdminCard>
      )}

      {activeTab === "blocker" && (
        <AdminCard titleKey="admin_launch_readiness_kead0bf4e">
          <LaunchBlockerBoard />
        </AdminCard>
      )}

      {activeTab === "approval" && (
        <AdminCard titleKey="admin_launch_readiness_approved_2">
          <LaunchApprovalTable />
        </AdminCard>
      )}
    </>
  );
}
