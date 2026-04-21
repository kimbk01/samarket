"use client";

import { useMemo } from "react";
import Link from "next/link";
import { getOpsKnowledgeGraphSummary } from "@/lib/ops-knowledge-graph/mock-ops-knowledge-graph-summary";

export function OpsKnowledgeGraphSummaryCards() {
  const summary = useMemo(() => getOpsKnowledgeGraphSummary(), []);

  return (
    <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
      <div className="rounded-ui-rect border border-sam-border bg-sam-surface p-4">
        <p className="sam-text-helper text-sam-muted">노드 / 엣지</p>
        <p className="sam-text-page-title font-semibold text-sam-fg">
          {summary.totalNodes} / {summary.totalEdges}
        </p>
      </div>
      <div className="rounded-ui-rect border border-sam-border bg-sam-surface p-4">
        <p className="sam-text-helper text-sam-muted">문서·이슈 노드 / 해결 사례</p>
        <p className="sam-text-page-title font-semibold text-sam-fg">
          {summary.totalDocumentNodes}·{summary.totalIncidentNodes} / {summary.totalResolutionCases}
        </p>
      </div>
      <div className="rounded-ui-rect border border-sam-border bg-sam-surface p-4">
        <p className="sam-text-helper text-sam-muted">Top 문서 / 최근 수정</p>
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
