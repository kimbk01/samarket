"use client";

import { useAdminSyncLoad } from "@/components/admin/useAdminSyncLoad";
import { AdminSyncLoadGate } from "@/components/admin/AdminSyncLoadGate";
import { useI18n } from "@/components/i18n/AppLanguageProvider";
import { useState } from "react";
import { AdminPageHeader } from "@/components/admin/AdminPageHeader";
import { AdminCard } from "@/components/admin/AdminCard";
import { OpsRunbookSummaryCards } from "./OpsRunbookSummaryCards";
import { OpsRunbookExecutionTable } from "./OpsRunbookExecutionTable";
import type { OpsRunbookExecutionStatus } from "@/lib/types/ops-runbook";
import { loadOpsRunbookWorkspaceFromServer } from "@/lib/ops-runbooks/ops-runbooks-sync-client";

import { AdminActionButton, AdminActionLink } from "@/components/admin/ui/AdminActionButton";
export function AdminOpsRunbookPage() {
  const { t } = useI18n();
  const [activeTab, setActiveTab] = useState<"list" | "summary">("list");
  const [statusFilter, setStatusFilter] = useState<OpsRunbookExecutionStatus | "">("");
  const [refresh, setRefresh] = useState(0);
  const { state: loadState, reload } = useAdminSyncLoad(loadOpsRunbookWorkspaceFromServer);
  const hydrated = loadState.status === "ready";

  if (!hydrated) {
    return (
      <>
        <AdminPageHeader titleKey="admin_menu_manage_runbooks" />
        <AdminSyncLoadGate state={loadState} onRetry={reload} />
      </>
    );
  }

  return (
    <>
      <AdminPageHeader titleKey="admin_menu_manage_runbooks" />
      <div className="mb-4 flex flex-wrap items-center gap-2">
        <AdminActionLink href="/admin/ops-runbooks/start" variant="primary">
          {t("admin_ops_tools_runbook_new")}
        </AdminActionLink>
        <AdminActionButton
          variant="secondary"
          onClick={() => setActiveTab(activeTab === "list" ? "summary" : "list")}
        >
          {activeTab === "list"
            ? t("admin_ops_tools_runbook_view_summary")
            : t("admin_ops_tools_runbook_view_list")}
        </AdminActionButton>
      </div>
      {activeTab === "summary" ? (
        <AdminCard titleKey="admin_ops_tools_runbook_card_summary">
          <OpsRunbookSummaryCards />
        </AdminCard>
      ) : (
        <>
          <div className="mb-4 flex flex-wrap items-center gap-2">
            <label className="sam-text-body text-sam-fg">{t("admin_ops_tools_board_th_status")}</label>
            <select
              value={statusFilter}
              onChange={(e) => setStatusFilter(e.target.value as OpsRunbookExecutionStatus | "")}
              className="rounded border border-sam-border px-3 py-2 sam-text-body"
            >
              <option value="">{t("admin_ops_tools_surface_all")}</option>
              <option value="in_progress">{t("admin_ops_tools_checklist_in_progress")}</option>
              <option value="completed">{t("admin_ops_tools_checklist_done")}</option>
              <option value="pending">{t("admin_ops_tools_checklist_todo")}</option>
              <option value="aborted">{t("admin_ops_tools_rb_exec_aborted")}</option>
            </select>
          </div>
          <AdminCard titleKey="admin_ops_tools_runbook_card_history">
            <OpsRunbookExecutionTable statusFilter={statusFilter} refresh={refresh} />
          </AdminCard>
        </>
      )}
    </>
  );
}
