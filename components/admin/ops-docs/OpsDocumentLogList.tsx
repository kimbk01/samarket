"use client";

import { useMemo } from "react";
import { useI18n } from "@/components/i18n/AppLanguageProvider";
import { getOpsDocumentLogs } from "@/lib/ops-docs/mock-ops-document-logs";
import { OPS_DOC_LOG_ACTION_KEYS } from "@/components/admin/i18n/admin-ops-doc-label-keys";
import { adminDateLocaleTag } from "@/components/admin/i18n/admin-date-locale";

interface OpsDocumentLogListProps {
  documentId: string;
}

export function OpsDocumentLogList({ documentId }: OpsDocumentLogListProps) {
  const { t, language } = useI18n();
  const dateLocale = adminDateLocaleTag(language);
  const logs = useMemo(
    () => getOpsDocumentLogs(documentId),
    [documentId]
  );

  if (logs.length === 0) {
    return (
      <div className="rounded-ui-rect border border-sam-border bg-sam-surface py-8 text-center sam-text-body text-sam-muted">
        {t("admin_ops_doc_log_empty")}
      </div>
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
            {OPS_DOC_LOG_ACTION_KEYS[log.actionType]
              ? t(OPS_DOC_LOG_ACTION_KEYS[log.actionType])
              : log.actionType}
          </span>
          <span className="text-sam-muted">{log.actorNickname}</span>
          {log.note && (
            <span className="text-sam-muted">· {log.note}</span>
          )}
          <span className="ml-auto text-sam-meta">
            {new Date(log.createdAt).toLocaleString(dateLocale)}
          </span>
        </li>
      ))}
    </ul>
  );
}
