"use client";

import { useI18n } from "@/components/i18n/AppLanguageProvider";
import { confirmAdminAction } from "@/lib/admin/operator-ux/admin-confirm-action";
import { adminActionLevel } from "@/lib/admin/operator-ux/admin-action-levels";
import { AdminTabs } from "@/components/admin/ui/AdminTabs";
import {
  OPS_TOOLS_RUNBOOK_EXEC_STATUS_KEYS,
  OPS_TOOLS_RUNBOOK_LINK_KEYS,
  opsToolsLabel,
} from "@/components/admin/i18n/admin-ops-tools-label-keys";
import { useMemo, useState } from "react";
import Link from "next/link";
import { AdminPageHeader } from "@/components/admin/AdminPageHeader";
import { AdminCard } from "@/components/admin/AdminCard";
import { getOpsRunbookExecutionById } from "@/lib/ops-runbooks/ops-runbooks-state";
import { completeRunbookExecution, abortRunbookExecution } from "@/lib/ops-runbooks/ops-runbook-utils";
import { OpsRunbookStepWorkflow } from "./OpsRunbookStepWorkflow";
import { OpsRunbookResultForm } from "./OpsRunbookResultForm";
import { OpsRunbookExecutionLogList } from "./OpsRunbookExecutionLogList";
import { OpsKnowledgeRecommendationPanel } from "@/components/admin/ops-knowledge/OpsKnowledgeRecommendationPanel";
import { OpsRelatedDocumentPanel } from "@/components/admin/ops-knowledge-graph/OpsRelatedDocumentPanel";
import type { OpsKnowledgeRecommendSourceType } from "@/lib/types/ops-knowledge";
import type { MessageKey } from "@/lib/i18n/messages";
import { AdminActionButton } from "@/components/admin/ui/AdminActionButton";
import { formatAdminManilaDateTime } from "@/lib/admin/metrics/manila-period";

type TabId = "detail" | "steps" | "result" | "logs";

const ADMIN_ID = "admin1";
export function OpsRunbookExecutionDetailPage({ executionId }: { executionId: string }) {
  const { t, language } = useI18n();
  const ko = language !== "en";
  const adminNickname = t("admin_ops_tools_admin_nickname");
  const [activeTab, setActiveTab] = useState<TabId>("detail");
  const [refresh, setRefresh] = useState(0);

  const exec = useMemo(
    () => getOpsRunbookExecutionById(executionId),
    [executionId, refresh]
  );

  if (!exec) {
    return (
      <>
        <AdminPageHeader titleKey="admin_ops_tools_runbook_detail_not_found_title" backHref="/admin/ops-runbooks" />
        <p className="sam-text-body text-sam-muted">{t("admin_ops_tools_runbook_detail_not_found")}</p>
      </>
    );
  }

  const handleComplete = () => {
    completeRunbookExecution(executionId, ADMIN_ID, adminNickname);
    setRefresh((r) => r + 1);
  };

  const handleAbort = async () => {
    // 실행 중단 = forceCancel(L3) — 사유는 실행 기록(중단 로그 note)에 남긴다.
    const confirmed = await confirmAdminAction({
      level: adminActionLevel("forceCancel"),
      ko,
      title: t("admin_ops_tools_runbook_confirm_abort"),
      confirmLabel: t("admin_ops_tools_rb_exec_aborted"),
      destructive: true,
      reasonPlaceholder: t("admin_ops_tools_runbook_abort_reason"),
    });
    if (!confirmed.ok) return;
    abortRunbookExecution(
      executionId,
      ADMIN_ID,
      adminNickname,
      confirmed.reason || t("admin_ops_tools_runbook_abort_reason")
    );
    setRefresh((r) => r + 1);
  };

  const tabs: { id: TabId; labelKey: MessageKey }[] = [
    { id: "detail", labelKey: "admin_ops_tools_runbook_tab_detail" },
    { id: "steps", labelKey: "admin_ops_tools_runbook_tab_steps" },
    { id: "result", labelKey: "admin_ops_tools_rb_log_result" },
    { id: "logs", labelKey: "admin_ops_tools_runbook_tab_logs" },
  ];

  return (
    <>
      <AdminPageHeader title={exec.documentTitle} backHref="/admin/ops-runbooks" />
      <div className="mb-4 flex flex-wrap items-center gap-2">
        <Link
          href={`/admin/ops-docs/${exec.documentId}`}
          className="rounded border border-sam-border bg-sam-surface px-3 py-2 sam-text-body text-sam-fg hover:bg-sam-app"
        >{t("admin_ops_tools_runbook_view_doc")}</Link>
        {exec.executionStatus === "in_progress" && (
          <>
            <AdminActionButton
              onClick={handleComplete}
              variant="primary"
            >{t("admin_ops_tools_rb_log_complete")}</AdminActionButton>
            <AdminActionButton
              onClick={handleAbort}
              variant="danger"
            >{t("admin_ops_tools_rb_exec_aborted")}</AdminActionButton>
          </>
        )}
      </div>
      <AdminTabs
        tabs={tabs.map((tab) => ({ id: tab.id, label: t(tab.labelKey) }))}
        ariaLabel="화면 탭"
        value={activeTab}
        onChange={(id) => setActiveTab(id as TabId)}
        syncUrl={false}
        className="mb-4"
      />
      {activeTab === "detail" && (
        <div className="grid gap-4 lg:grid-cols-[1fr,280px]">
          <AdminCard>
            <div className="space-y-4">
            <div className="flex flex-wrap gap-2 sam-text-body-secondary">
              <span className="rounded bg-sam-surface-muted px-2 py-0.5 text-sam-fg">
                {exec.documentType}
              </span>
              <span className="rounded bg-sam-surface-muted px-2 py-0.5 text-sam-fg">
                {t(opsToolsLabel(OPS_TOOLS_RUNBOOK_LINK_KEYS, exec.linkedType))}
                {exec.linkedId && ` · ${exec.linkedId}`}
              </span>
              <span
                className={`rounded px-2 py-0.5 ${
                  exec.executionStatus === "completed"
                    ? "bg-sam-success-soft text-sam-success"
                    : exec.executionStatus === "in_progress"
                      ? "bg-sam-warning-soft text-sam-warning"
                      : "bg-sam-surface-muted text-sam-muted"
                }`}
              >
                {t(opsToolsLabel(OPS_TOOLS_RUNBOOK_EXEC_STATUS_KEYS, exec.executionStatus))}
              </span>
            </div>
            <p className="sam-text-body text-sam-fg">{exec.summary}</p>
            {exec.resultNote && (
              <div className="rounded border border-sam-border-soft bg-sam-app p-3 sam-text-body-secondary text-sam-fg">
                결과 메모: {exec.resultNote}
              </div>
            )}
            <div className="border-t border-sam-border-soft pt-3 sam-text-body-secondary text-sam-muted">
              시작 {formatAdminManilaDateTime(exec.startedAt)} ·{" "}
              {exec.completedAt
                ? `완료 ${formatAdminManilaDateTime(exec.completedAt)}`
                : "진행 중"}
              {" · "}
              담당 {exec.startedByAdminNickname}
            </div>
          </div>
        </AdminCard>
        <div>
          <OpsKnowledgeRecommendationPanel
            sourceType={exec.linkedType as OpsKnowledgeRecommendSourceType}
            sourceId={exec.linkedId}
            titleKey="admin_ops_tools_kg_panel_related_default"
            compact
            recentViewSource="runbook"
          />
          <div className="mt-4">
            <OpsRelatedDocumentPanel titleKey="admin_ops_tools_runbook_graph_top" compact />
          </div>
        </div>
        </div>
      )}
      {activeTab === "steps" && (
        <AdminCard titleKey="admin_ops_tools_runbook_tab_steps">
          <OpsRunbookStepWorkflow
            executionId={executionId}
            executionStatus={exec.executionStatus}
            onStepUpdate={() => setRefresh((r) => r + 1)}
          />
        </AdminCard>
      )}
      {activeTab === "result" && (
        <AdminCard titleKey="admin_ops_tools_runbook_card_result">
          <OpsRunbookResultForm
            executionId={executionId}
            onSaved={() => setRefresh((r) => r + 1)}
          />
        </AdminCard>
      )}
      {activeTab === "logs" && (
        <AdminCard titleKey="admin_ops_tools_runbook_tab_logs">
          <OpsRunbookExecutionLogList executionId={executionId} />
        </AdminCard>
      )}
    </>
  );
}
