"use client";

import { useMemo } from "react";
import Link from "next/link";
import { getOpsKnowledgeRecommendationLogs } from "@/lib/ops-knowledge/mock-ops-knowledge-recommendation-logs";

const SOURCE_LABELS: Record<string, string> = {
  incident: "이슈",
  deployment: "배포",
  rollback: "롤백",
  fallback: "Fallback",
  kill_switch: "킬스위치",
  manual_search: "검색",
};

export function OpsKnowledgeRecommendationLogTable() {
  const logs = useMemo(() => getOpsKnowledgeRecommendationLogs({ limit: 30 }), []);

  if (logs.length === 0) {
    return (
      <div className="rounded-ui-rect border border-sam-border bg-sam-surface py-8 text-center sam-text-body text-sam-muted">
        추천 로그가 없습니다.
      </div>
    );
  }

  return (
    <div className="overflow-x-auto rounded-ui-rect border border-sam-border bg-sam-surface">
      <table className="w-full min-w-[560px] border-collapse sam-text-body">
        <thead>
          <tr className="border-b border-sam-border bg-sam-app">
            <th className="px-3 py-2.5 text-left font-medium text-sam-fg">출처</th>
            <th className="px-3 py-2.5 text-left font-medium text-sam-fg">문서</th>
            <th className="px-3 py-2.5 text-left font-medium text-sam-fg">사유</th>
            <th className="px-3 py-2.5 text-left font-medium text-sam-fg">점수</th>
            <th className="px-3 py-2.5 text-left font-medium text-sam-fg">클릭</th>
            <th className="px-3 py-2.5 text-left font-medium text-sam-fg">시각</th>
          </tr>
        </thead>
        <tbody>
          {logs.map((log) => (
            <tr key={log.id} className="border-b border-sam-border-soft hover:bg-sam-app">
              <td className="px-3 py-2.5 text-sam-fg">
                {SOURCE_LABELS[log.sourceType]}
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
