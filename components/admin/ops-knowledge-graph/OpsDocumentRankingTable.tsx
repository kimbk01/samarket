"use client";

import { AdminEmptyState } from "@/components/admin/ui/AdminStateViews";
import { useI18n } from "@/components/i18n/AppLanguageProvider";
import { useMemo } from "react";
import Link from "next/link";
import { getOpsKnowledgeDocumentRankings } from "@/lib/ops-knowledge-graph/ops-knowledge-graph-state";
import { getOpsDocumentById } from "@/lib/ops-docs/ops-docs-state";

export function OpsDocumentRankingTable() {
  const { t, language } = useI18n();
  const ko = language !== "en";
  /** 고정 상한 없이 번들 전체 — 지식 그래프는 문서·런북 번들에서 통째로 만들어지는 구조. */
  const rankings = useMemo(() => getOpsKnowledgeDocumentRankings({ limit: Number.MAX_SAFE_INTEGER }), []);

  if (rankings.length === 0) {
    return (
      <AdminEmptyState ko={ko} message={t("admin_ops_tools_kg_ranking_empty")} />
    );
  }

  return (
    <div className="overflow-x-auto rounded-ui-rect border border-sam-border bg-sam-surface">
      <table className="w-full min-w-[640px] border-collapse sam-text-body">
        <thead>
          <tr className="border-b border-sam-border bg-sam-app">
            <th className="px-3 py-2.5 text-left font-medium text-sam-fg">{t("admin_ops_tools_kg_th_rank")}</th>
            <th className="px-3 py-2.5 text-left font-medium text-sam-fg">{t("admin_ops_tools_node_document")}</th>
            <th className="px-3 py-2.5 text-left font-medium text-sam-fg">{t("admin_ops_tools_kg_th_score")}</th>
            <th className="px-3 py-2.5 text-left font-medium text-sam-fg">{t("admin_ops_tools_kg_th_views")}</th>
            <th className="px-3 py-2.5 text-left font-medium text-sam-fg">{t("admin_ops_tools_kg_th_rec_clicks")}</th>
            <th className="px-3 py-2.5 text-left font-medium text-sam-fg">{t("admin_ops_tools_kg_th_resolution_link")}</th>
            <th className="px-3 py-2.5 text-left font-medium text-sam-fg">{t("admin_ops_tools_kg_th_exec_count")}</th>
          </tr>
        </thead>
        <tbody>
          {rankings.map((r, idx) => {
            const doc = getOpsDocumentById(r.documentId);
            return (
              <tr key={r.id} className="border-b border-sam-border-soft hover:bg-sam-app">
                <td className="px-3 py-2.5 font-medium text-sam-fg">{idx + 1}</td>
                <td className="px-3 py-2.5">
                  <Link
                    href={`/admin/ops-docs/${r.documentId}`}
                    className="font-medium text-signature hover:underline"
                  >
                    {doc?.title ?? r.documentId}
                  </Link>
                </td>
                <td className="px-3 py-2.5 text-sam-fg">{r.rankingScore.toFixed(2)}</td>
                <td className="px-3 py-2.5 text-sam-muted">{r.viewCount}</td>
                <td className="px-3 py-2.5 text-sam-muted">{r.recommendationClickCount}</td>
                <td className="px-3 py-2.5 text-sam-muted">{r.resolvedWithCount}</td>
                <td className="px-3 py-2.5 text-sam-muted">{r.runbookExecutionCount}</td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}
