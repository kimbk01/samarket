"use client";

import { useI18n } from "@/components/i18n/AppLanguageProvider";
import {
  OPS_TOOLS_PATTERN_LOG_KEYS,
  opsToolsLabel,
} from "@/components/admin/i18n/admin-ops-tools-label-keys";
import { useMemo } from "react";
import { getOpsPatternLogs } from "@/lib/ops-learning/mock-ops-pattern-logs";

interface OpsPatternLogListProps {
  patternId: string;
}

export function OpsPatternLogList({ patternId }: OpsPatternLogListProps) {
  const { t } = useI18n();
  const logs = useMemo(() => getOpsPatternLogs(patternId), [patternId]);

  if (logs.length === 0) {
    return (
      <div>
        <p className="sam-text-helper font-medium text-sam-fg">{t("admin_ops_tools_learning_tab_logs")}</p>
        <p className="mt-1 sam-text-body-secondary text-sam-muted">{t("admin_ops_tools_learning_logs_empty")}</p>
      </div>
    );
  }

  return (
    <div>
      <p className="sam-text-helper font-medium text-sam-fg">{t("admin_ops_tools_learning_tab_logs")}</p>
      <ul className="mt-2 space-y-1">
        {logs.map((log) => (
          <li
            key={log.id}
            className="flex flex-wrap items-center gap-2 rounded border border-sam-border-soft bg-sam-surface px-2 py-1.5 sam-text-body-secondary"
          >
            <span className="rounded bg-sam-surface-muted px-1.5 py-0.5 font-medium text-sam-fg">
              {t(opsToolsLabel(OPS_TOOLS_PATTERN_LOG_KEYS, log.actionType))}
            </span>
            <span className="text-sam-muted">{log.actorNickname}</span>
            {log.note && <span className="text-sam-muted">· {log.note}</span>}
            <span className="ml-auto text-sam-meta">
              {new Date(log.createdAt).toLocaleString("ko-KR")}
            </span>
          </li>
        ))}
      </ul>
    </div>
  );
}
