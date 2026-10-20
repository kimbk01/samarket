"use client";

import { useI18n } from "@/components/i18n/AppLanguageProvider";
import Link from "next/link";
import type { OpsKnowledgeSearchLog } from "@/lib/types/ops-knowledge";
import { useAdminListQuery } from "@/lib/admin/list-query/use-admin-list-query";
import { AdminServerListFrame } from "@/components/admin/sync-list/AdminServerListFrame";
import { useAdminServerPage } from "@/components/admin/sync-list/useAdminServerPage";

import { formatAdminManilaDateTime } from "@/lib/admin/metrics/manila-period";
export function OpsKnowledgeSearchLogTable() {
  const { t, language } = useI18n();
  const ko = language !== "en";
  const adminNickname = t("admin_ops_tools_admin_nickname");
  /** 서버 페이지 (`GET /api/admin/ops-knowledge?part=search-logs`, R7) — 화면 고정 상한(30건) 없음. 쪽·크기는 주소에 보존. */
  const lq = useAdminListQuery();
  const page = useAdminServerPage<OpsKnowledgeSearchLog>(`/api/admin/ops-knowledge?part=search-logs&${lq.apiQueryString}`, lq.refreshKey);

  return (
    <AdminServerListFrame
      ko={ko}
      state={page}
      page={lq.query.page}
      size={lq.query.size}
      onPageChange={lq.setPage}
      onSizeChange={lq.setSize}
      onRetry={lq.refresh}
      emptyMessage={t("admin_ops_tools_kb_search_logs_empty")}
    >
      {(logs) => (
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
