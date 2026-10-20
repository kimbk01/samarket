"use client";

import { useAdminSyncLoad } from "@/components/admin/useAdminSyncLoad";
import { AdminSyncLoadGate } from "@/components/admin/AdminSyncLoadGate";
import { useI18n } from "@/components/i18n/AppLanguageProvider";
import { AdminPageHeader } from "@/components/admin/AdminPageHeader";
import { AdminCard } from "@/components/admin/AdminCard";
import { OpsRunbookSummaryCards } from "./OpsRunbookSummaryCards";
import { OpsRunbookExecutionTable } from "./OpsRunbookExecutionTable";
import { loadOpsRunbookWorkspaceFromServer } from "@/lib/ops-runbooks/ops-runbooks-sync-client";

import { AdminActionButton, AdminActionLink } from "@/components/admin/ui/AdminActionButton";
import { useAdminListQuery } from "@/lib/admin/list-query/use-admin-list-query";
import { AdminFilterBar } from "@/components/admin/ui/AdminFilterBar";
const RUNBOOK_STATUSES = ["in_progress", "completed", "pending", "aborted"] as const;
const RUNBOOK_EXTRAS = ["view"] as const;

export function AdminOpsRunbookPage() {
  const { t, language } = useI18n();
  const ko = language !== "en";
  /** 상태 필터·쪽·보기(목록/요약)는 주소에 보존 (R7). */
  const lq = useAdminListQuery({ statuses: RUNBOOK_STATUSES, extras: RUNBOOK_EXTRAS });
  const activeTab = lq.query.extras.view === "summary" ? "summary" : "list";
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
      {/* 필터 바 [조회] 가 화면 주 동작 — 런북 시작·보기 전환은 보조 (설계 2-2, 머리글 오른쪽) */}
      <div className="mb-4 flex flex-wrap items-center justify-end gap-2">
        <AdminActionButton
          variant="secondary"
          onClick={() => lq.setExtra("view", activeTab === "list" ? "summary" : "")}
        >
          {activeTab === "list"
            ? t("admin_ops_tools_runbook_view_summary")
            : t("admin_ops_tools_runbook_view_list")}
        </AdminActionButton>
        <AdminActionLink href="/admin/ops-runbooks/start" variant="secondary">
          {t("admin_ops_tools_runbook_new")}
        </AdminActionLink>
      </div>
      {activeTab === "summary" ? (
        <AdminCard titleKey="admin_ops_tools_runbook_card_summary">
          <OpsRunbookSummaryCards />
        </AdminCard>
      ) : (
        <>
          <AdminFilterBar
            ko={ko}
            className="mb-4"
            draft={lq.draft}
            onDraftChange={lq.setDraft}
            onSubmit={lq.submit}
            onReset={lq.reset}
            showPeriod={false}
            showSearch={false}
            status={{
              label: t("admin_ops_tools_board_th_status"),
              value: lq.query.status,
              onChange: lq.setStatus,
              options: [
                { value: "", label: t("admin_ops_tools_surface_all") },
                { value: "in_progress", label: t("admin_ops_tools_checklist_in_progress") },
                { value: "completed", label: t("admin_ops_tools_checklist_done") },
                { value: "pending", label: t("admin_ops_tools_checklist_todo") },
                { value: "aborted", label: t("admin_ops_tools_rb_exec_aborted") },
              ],
            }}
          />
          <AdminCard titleKey="admin_ops_tools_runbook_card_history">
            <OpsRunbookExecutionTable lq={lq} />
          </AdminCard>
        </>
      )}
    </>
  );
}
