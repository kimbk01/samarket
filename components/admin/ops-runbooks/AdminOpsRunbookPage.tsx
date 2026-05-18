"use client";

import { useI18n } from "@/components/i18n/AppLanguageProvider";
import { useState } from "react";
import Link from "next/link";
import { AdminPageHeader } from "@/components/admin/AdminPageHeader";
import { AdminCard } from "@/components/admin/AdminCard";
import { OpsRunbookSummaryCards } from "./OpsRunbookSummaryCards";
import { OpsRunbookExecutionTable } from "./OpsRunbookExecutionTable";
import type { OpsRunbookExecutionStatus } from "@/lib/types/ops-runbook";

export function AdminOpsRunbookPage() {
  const { t } = useI18n();
  const [activeTab, setActiveTab] = useState<"list" | "summary">("list");
  const [statusFilter, setStatusFilter] = useState<OpsRunbookExecutionStatus | "">("");
  const [refresh, setRefresh] = useState(0);

  return (
    <>
      <AdminPageHeader titleKey="admin_ops_tools_runbook_page_title" />
      <div className="mb-4 flex flex-wrap items-center gap-2">
        <Link
          href="/admin/ops-runbooks/start"
          className="rounded border border-signature bg-signature px-3 py-2 sam-text-body font-medium text-white"
        >{t("admin_ops_tools_runbook_new")}</Link>
        <button
          type="button"
          onClick={() => setActiveTab(activeTab === "list" ? "summary" : "list")}
          className="rounded border border-sam-border bg-sam-surface px-3 py-2 sam-text-body text-sam-fg"
        >
          {activeTab === "list"
            ? t("admin_ops_tools_runbook_view_summary")
            : t("admin_ops_tools_runbook_view_list")}
        </button>
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
