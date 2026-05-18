"use client";

import { useI18n } from "@/components/i18n/AppLanguageProvider";
import { OPS_DOC_TYPE_KEYS } from "@/components/admin/i18n/admin-ops-doc-label-keys";
import {
  OPS_TOOLS_RUNBOOK_EXEC_STATUS_KEYS,
  OPS_TOOLS_RUNBOOK_LINK_KEYS,
  opsToolsLabel,
} from "@/components/admin/i18n/admin-ops-tools-label-keys";
import { useMemo } from "react";
import Link from "next/link";
import { getOpsRunbookExecutions } from "@/lib/ops-runbooks/mock-ops-runbook-executions";
import type { OpsRunbookExecutionStatus, OpsRunbookLinkedType } from "@/lib/types/ops-runbook";

interface OpsRunbookExecutionTableProps {
  statusFilter?: OpsRunbookExecutionStatus | "";
  refresh?: number;
}

export function OpsRunbookExecutionTable({
  statusFilter = "",
  refresh = 0,
}: OpsRunbookExecutionTableProps) {
  const { t } = useI18n();
  const executions = useMemo(
    () =>
      getOpsRunbookExecutions({
        status: statusFilter || undefined,
      }),
    [statusFilter, refresh]
  );

  if (executions.length === 0) {
    return (
      <div className="rounded-ui-rect border border-sam-border bg-sam-surface py-12 text-center sam-text-body text-sam-muted">{t("admin_ops_tools_runbook_history_empty")}</div>
    );
  }

  return (
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
                      ? "bg-emerald-50 text-emerald-800"
                      : e.executionStatus === "in_progress"
                        ? "bg-amber-50 text-amber-800"
                        : e.executionStatus === "aborted"
                          ? "bg-red-50 text-red-800"
                          : "bg-sam-surface-muted text-sam-muted"
                  }`}
                >
                  {t(opsToolsLabel(OPS_TOOLS_RUNBOOK_EXEC_STATUS_KEYS, e.executionStatus))}
                </span>
              </td>
              <td className="px-3 py-2.5 text-sam-muted">
                {new Date(e.startedAt).toLocaleString("ko-KR")}
              </td>
              <td className="px-3 py-2.5 text-sam-muted">
                {e.startedByAdminNickname}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
