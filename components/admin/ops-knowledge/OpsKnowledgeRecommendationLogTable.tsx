"use client";

import { useI18n } from "@/components/i18n/AppLanguageProvider";
import {
  OPS_TOOLS_KB_SOURCE_KEYS,
  opsToolsLabel,
} from "@/components/admin/i18n/admin-ops-tools-label-keys";
import { useMemo } from "react";
import Link from "next/link";
import { getOpsKnowledgeRecommendationLogs } from "@/lib/ops-knowledge/mock-ops-knowledge-recommendation-logs";

export function OpsKnowledgeRecommendationLogTable() {
  const { t } = useI18n();
  const logs = useMemo(() => getOpsKnowledgeRecommendationLogs({ limit: 30 }), []);

  if (logs.length === 0) {
    return (
      <div className="rounded-ui-rect border border-sam-border bg-sam-surface py-8 text-center sam-text-body text-sam-muted">{t("admin_ops_tools_kb_rec_logs_empty")}</div>
    );
  }

  return (
    <div className="overflow-x-auto rounded-ui-rect border border-sam-border bg-sam-surface">
      <table className="w-full min-w-[560px] border-collapse sam-text-body">
        <thead>
          <tr className="border-b border-sam-border bg-sam-app">
            <th className="px-3 py-2.5 text-left font-medium text-sam-fg">{t("admin_ops_tools_learning_th_source")}</th>
            <th className="px-3 py-2.5 text-left font-medium text-sam-fg">{t("admin_ops_tools_node_document")}</th>
            <th className="px-3 py-2.5 text-left font-medium text-sam-fg">{t("admin_ops_tools_kg_th_reason")}</th>
            <th className="px-3 py-2.5 text-left font-medium text-sam-fg">{t("admin_ops_tools_kb_th_score")}</th>
            <th className="px-3 py-2.5 text-left font-medium text-sam-fg">{t("admin_ops_tools_kb_th_click")}</th>
            <th className="px-3 py-2.5 text-left font-medium text-sam-fg">{t("admin_ops_tools_kb_th_time")}</th>
          </tr>
        </thead>
        <tbody>
          {logs.map((log) => (
            <tr key={log.id} className="border-b border-sam-border-soft hover:bg-sam-app">
              <td className="px-3 py-2.5 text-sam-fg">
                {t(opsToolsLabel(OPS_TOOLS_KB_SOURCE_KEYS, log.sourceType))}
                {log.sourceId && ` · ${log.sourceId}`}
              </td>
              <td className="px-3 py-2.5">
                <Link
                  href={`/admin/ops-docs/${log.recommendedDocumentId}`}
                  className="text-signature hover:underline"
                >
                  {log.recommendedDocumentId}
                </Link>
              </td>
              <td className="px-3 py-2.5 text-sam-muted sam-text-body-secondary">
                {log.recommendationReason}
              </td>
              <td className="px-3 py-2.5 text-sam-fg">
                {(log.score * 100).toFixed(0)}%
              </td>
              <td className="px-3 py-2.5">
                {log.clicked ? (
                  <span className="text-emerald-600">Y</span>
                ) : (
                  <span className="text-sam-meta">N</span>
                )}
              </td>
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
