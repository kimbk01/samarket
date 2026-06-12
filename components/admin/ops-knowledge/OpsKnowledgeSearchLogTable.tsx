"use client";

import { useI18n } from "@/components/i18n/AppLanguageProvider";
import { useMemo } from "react";
import Link from "next/link";
import { getOpsKnowledgeSearchLogs } from "@/lib/ops-knowledge/ops-knowledge-state";

export function OpsKnowledgeSearchLogTable() {
  const { t } = useI18n();
  const adminNickname = t("admin_ops_tools_admin_nickname");
  const logs = useMemo(() => getOpsKnowledgeSearchLogs({ limit: 30 }), []);

  if (logs.length === 0) {
    return (
      <div className="rounded-ui-rect border border-sam-border bg-sam-surface py-8 text-center sam-text-body text-sam-muted">{t("admin_ops_tools_kb_search_logs_empty")}</div>
    );
  }

  return (
    <div className="overflow-x-auto rounded-ui-rect border border-sam-border bg-sam-surface">
      <table className="w-full min-w-[520px] border-collapse sam-text-body">
        <thead>
          <tr className="border-b border-sam-border bg-sam-app">
            <th className="px-3 py-2.5 text-left font-medium text-sam-fg">{t("admin_ops_tools_kb_th_keyword")}</th>
            <th className="px-3 py-2.5 text-left font-medium text-sam-fg">{t("admin_ops_tools_kb_th_result_count")}</th>
            <th className="px-3 py-2.5 text-left font-medium text-sam-fg">{t("admin_ops_tools_kb_th_clicked_doc")}</th>
            <th className="px-3 py-2.5 text-left font-medium text-sam-fg">{t("admin_ops_tools_kb_th_searcher")}</th>
            <th className="px-3 py-2.5 text-left font-medium text-sam-fg">{t("admin_ops_tools_kb_th_time")}</th>
          </tr>
        </thead>
        <tbody>
          {logs.map((log) => (
            <tr key={log.id} className="border-b border-sam-border-soft hover:bg-sam-app">
              <td className="px-3 py-2.5 font-medium text-sam-fg">{log.query}</td>
              <td className="px-3 py-2.5 text-sam-fg">{log.resultCount}</td>
              <td className="px-3 py-2.5">
                {log.clickedDocumentId ? (
                  <Link
                    href={`/admin/ops-docs/${log.clickedDocumentId}`}
                    className="text-signature hover:underline"
                  >
                    {log.clickedDocumentId}
                  </Link>
                ) : (
                  "-"
                )}
              </td>
              <td className="px-3 py-2.5 text-sam-muted">{log.adminNickname}</td>
              <td className="px-3 py-2.5 text-sam-muted">
                {new Date(log.createdAt).toLocaleString("ko-KR")}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
