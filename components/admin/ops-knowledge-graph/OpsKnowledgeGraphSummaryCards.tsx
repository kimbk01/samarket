"use client";

import { useI18n } from "@/components/i18n/AppLanguageProvider";
import { useMemo } from "react";
import Link from "next/link";
import { getOpsKnowledgeGraphSummary } from "@/lib/ops-knowledge-graph/mock-ops-knowledge-graph-summary";

export function OpsKnowledgeGraphSummaryCards() {
  const { t } = useI18n();
  const summary = useMemo(() => getOpsKnowledgeGraphSummary(), []);

  return (
    <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
      <div className="rounded-ui-rect border border-sam-border bg-sam-surface p-4">
        <p className="sam-text-helper text-sam-muted">{t("admin_ops_tools_kg_summary_nodes")}</p>
        <p className="sam-text-page-title font-semibold text-sam-fg">
          {summary.totalNodes} / {summary.totalEdges}
        </p>
      </div>
      <div className="rounded-ui-rect border border-sam-border bg-sam-surface p-4">
        <p className="sam-text-helper text-sam-muted">{t("admin_ops_tools_kg_summary_docs")}</p>
        <p className="sam-text-page-title font-semibold text-sam-fg">
          {summary.totalDocumentNodes}·{summary.totalIncidentNodes} / {summary.totalResolutionCases}
        </p>
      </div>
      <div className="rounded-ui-rect border border-sam-border bg-sam-surface p-4">
        <p className="sam-text-helper text-sam-muted">{t("admin_ops_tools_kg_summary_top")}</p>
        <p className="sam-text-body font-medium text-sam-fg">
          {summary.topDocumentId ? (
            <Link href={`/admin/ops-docs/${summary.topDocumentId}`} className="text-signature hover:underline">
              {summary.topDocumentId}
            </Link>
          ) : (
            "-"
          )}
          {" · "}
          {summary.latestUpdatedAt
            ? new Date(summary.latestUpdatedAt).toLocaleDateString("ko-KR")
            : "-"}
        </p>
      </div>
    </div>
  );
}
