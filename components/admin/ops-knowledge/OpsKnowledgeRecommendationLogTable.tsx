"use client";

import { useI18n } from "@/components/i18n/AppLanguageProvider";
import {
  OPS_TOOLS_KB_SOURCE_KEYS,
  opsToolsLabel,
} from "@/components/admin/i18n/admin-ops-tools-label-keys";
import Link from "next/link";
import type { OpsKnowledgeRecommendationLog } from "@/lib/types/ops-knowledge";
import { useAdminListQuery } from "@/lib/admin/list-query/use-admin-list-query";
import { AdminServerListFrame } from "@/components/admin/sync-list/AdminServerListFrame";
import { useAdminServerPage } from "@/components/admin/sync-list/useAdminServerPage";

import { formatAdminManilaDateTime } from "@/lib/admin/metrics/manila-period";
export function OpsKnowledgeRecommendationLogTable() {
  const { t, language } = useI18n();
  const ko = language !== "en";
  /** 서버 페이지 (`GET /api/admin/ops-knowledge?part=recommendation-logs`, R7) — 화면 고정 상한(30건) 없음. 쪽·크기는 주소에 보존. */
  const lq = useAdminListQuery();
  const page = useAdminServerPage<OpsKnowledgeRecommendationLog>(`/api/admin/ops-knowledge?part=recommendation-logs&${lq.apiQueryString}`, lq.refreshKey);

  return (
    <AdminServerListFrame
      ko={ko}
      state={page}
      page={lq.query.page}
      size={lq.query.size}
      onPageChange={lq.setPage}
      onSizeChange={lq.setSize}
      onRetry={lq.refresh}
      emptyMessage={t("admin_ops_tools_kb_rec_logs_empty")}
    >
      {(logs) => (
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
                  <span className="text-sam-success">Y</span>
                ) : (
                  <span className="text-sam-meta">N</span>
                )}
              </td>
              <td className="px-3 py-2.5 text-sam-muted">
                {formatAdminManilaDateTime(log.createdAt)}
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
