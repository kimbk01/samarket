"use client";

import { useI18n } from "@/components/i18n/AppLanguageProvider";
import { OPS_DOC_TYPE_KEYS } from "@/components/admin/i18n/admin-ops-doc-label-keys";
import {
  OPS_TOOLS_RUNBOOK_EXEC_STATUS_KEYS,
  OPS_TOOLS_RUNBOOK_LINK_KEYS,
  opsToolsLabel,
} from "@/components/admin/i18n/admin-ops-tools-label-keys";
import Link from "next/link";
import type { OpsRunbookExecution } from "@/lib/types/ops-runbook";

import { formatAdminManilaDateTime } from "@/lib/admin/metrics/manila-period";
import type { UseAdminListQueryResult } from "@/lib/admin/list-query/use-admin-list-query";
import { AdminServerListFrame } from "@/components/admin/sync-list/AdminServerListFrame";
import { useAdminServerPage } from "@/components/admin/sync-list/useAdminServerPage";
interface OpsRunbookExecutionTableProps {
  lq: UseAdminListQueryResult<"view">;
}

/** 런북 실행 이력 = 서버 페이지 (`GET /api/admin/ops-runbooks?part=executions`, R7) — 고정 상한(100건) 없음. */
export function OpsRunbookExecutionTable({ lq }: OpsRunbookExecutionTableProps) {
  const { t, language } = useI18n();
  const ko = language !== "en";
  const page = useAdminServerPage<OpsRunbookExecution>(
    `/api/admin/ops-runbooks?part=executions&${lq.apiQueryString}`,
    lq.refreshKey
  );

  return (
    <AdminServerListFrame
      ko={ko}
      state={page}
      page={lq.query.page}
      size={lq.query.size}
      onPageChange={lq.setPage}
      onSizeChange={lq.setSize}
      onRetry={lq.refresh}
      onReset={lq.isFiltered ? lq.reset : undefined}
      emptyMessage={t("admin_ops_tools_runbook_history_empty")}
    >
      {(executions) => (
    <div className="overflow-x-auto rounded-ui-rect border border-sam-border bg-sam-surface">
      <table className="w-full min-w-[640px] border-collapse sam-text-body">
        <thead>
          <tr className="border-b border-sam-border bg-sam-app">
            <th className="px-3 py-2.5 text-left font-medium text-sam-fg">{t("admin_ops_tools_node_document")}</th>
            <th className="px-3 py-2.5 text-left font-medium text-sam-fg">{t("admin_ops_tools_kg_th_type")}</th>
            <th className="px-3 py-2.5 text-left font-medium text-sam-fg">{t("admin_ops_tools_routines_th_link")}</th>
            <th className="px-3 py-2.5 text-left font-medium text-sam-fg">{t("admin_ops_tools_board_th_status")}</th>
            <th className="px-3 py-2.5 text-left font-medium text-sam-fg">{t("admin_ops_tools_runbook_th_started")}</th>
            <th className="px-3 py-2.5 text-left font-medium text-sam-fg">{t("admin_ops_tools_board_th_owner")}</th>
          </tr>
        </thead>
        <tbody>
          {executions.map((e) => (
            <tr key={e.id} className="border-b border-sam-border-soft hover:bg-sam-app">
              <td className="px-3 py-2.5">
                <Link
                  href={`/admin/ops-runbooks/${e.id}`}
                  className="font-medium text-signature hover:underline"
                >
                  {e.documentTitle}
                </Link>
              </td>
              <td className="px-3 py-2.5 text-sam-fg">
                {t(OPS_DOC_TYPE_KEYS[e.documentType])}
              </td>
              <td className="px-3 py-2.5 text-sam-fg">
                {t(opsToolsLabel(OPS_TOOLS_RUNBOOK_LINK_KEYS, e.linkedType))}
                {e.linkedId && ` · ${e.linkedId}`}
              </td>
              <td className="px-3 py-2.5">
                <span
                  className={`inline-block rounded px-2 py-0.5 sam-text-helper ${
                    e.executionStatus === "completed"
                      ? "bg-sam-success-soft text-sam-success"
                      : e.executionStatus === "in_progress"
                        ? "bg-sam-warning-soft text-sam-warning"
                        : e.executionStatus === "aborted"
                          ? "bg-sam-danger-soft text-sam-danger"
                          : "bg-sam-surface-muted text-sam-muted"
                  }`}
                >
                  {t(opsToolsLabel(OPS_TOOLS_RUNBOOK_EXEC_STATUS_KEYS, e.executionStatus))}
                </span>
              </td>
              <td className="px-3 py-2.5 text-sam-muted">
                {formatAdminManilaDateTime(e.startedAt)}
              </td>
              <td className="px-3 py-2.5 text-sam-muted">
                {e.startedByAdminNickname}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
      )}
    </AdminServerListFrame>
  );
}
