"use client";

import { AdminEmptyState } from "@/components/admin/ui/AdminStateViews";
import { useI18n } from "@/components/i18n/AppLanguageProvider";
import {
  OPS_TOOLS_RUNBOOK_LOG_KEYS,
  opsToolsLabel,
} from "@/components/admin/i18n/admin-ops-tools-label-keys";
import { useMemo } from "react";
import { getOpsRunbookExecutionLogs } from "@/lib/ops-runbooks/ops-runbooks-state";

interface OpsRunbookExecutionLogListProps {
  executionId: string;
}

export function OpsRunbookExecutionLogList({ executionId }: OpsRunbookExecutionLogListProps) {
  const { t, language } = useI18n();
  const ko = language !== "en";
  const logs = useMemo(
    () => getOpsRunbookExecutionLogs(executionId),
    [executionId]
  );

  if (logs.length === 0) {
    return (
      <AdminEmptyState ko={ko} message={t("admin_ops_tools_runbook_logs_empty")} />
    );
  }

  return (
    <ul className="space-y-2">
      {logs.map((log) => (
        <li
          key={log.id}
          className="flex flex-wrap items-center gap-2 rounded border border-sam-border-soft bg-sam-surface px-3 py-2 sam-text-body-secondary"
        >
          <span className="rounded bg-sam-surface-muted px-2 py-0.5 font-medium text-sam-fg">
            {t(opsToolsLabel(OPS_TOOLS_RUNBOOK_LOG_KEYS, log.actionType))}
          </span>
          <span className="text-sam-muted">{log.actorNickname}</span>
          {log.note && <span className="text-sam-muted">· {log.note}</span>}
          <span className="ml-auto text-sam-meta">
            {new Date(log.createdAt).toLocaleString("ko-KR")}
          </span>
        </li>
      ))}
    </ul>
  );
}
