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
      <div className="rounded-lg border border-gray-200 bg-white py-8 text-center text-[14px] text-gray-500">
        추천 로그가 없습니다.
      </div>
    );
  }

  return (
    <div className="overflow-x-auto rounded-lg border border-gray-200 bg-white">
      <table className="w-full min-w-[560px] border-collapse text-[14px]">
        <thead>
          <tr className="border-b border-gray-200 bg-gray-50">
            <th className="px-3 py-2.5 text-left font-medium text-gray-700">출처</th>
            <th className="px-3 py-2.5 text-left font-medium text-gray-700">문서</th>
            <th className="px-3 py-2.5 text-left font-medium text-gray-700">사유</th>
            <th className="px-3 py-2.5 text-left font-medium text-gray-700">점수</th>
            <th className="px-3 py-2.5 text-left font-medium text-gray-700">클릭</th>
            <th className="px-3 py-2.5 text-left font-medium text-gray-700">시각</th>
          </tr>
        </thead>
        <tbody>
          {logs.map((log) => (
            <tr key={log.id} className="border-b border-gray-100 hover:bg-gray-50">
              <td className="px-3 py-2.5 text-gray-700">
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
              <td className="px-3 py-2.5 text-gray-600 text-[13px]">
                {log.recommendationReason}
              </td>
              <td className="px-3 py-2.5 text-gray-700">
                {(log.score * 100).toFixed(0)}%
              </td>
              <td className="px-3 py-2.5">
                {log.clicked ? (
                  <span className="text-emerald-600">Y</span>
                ) : (
                  <span className="text-gray-400">N</span>
                )}
              </td>
              <td className="px-3 py-2.5 text-gray-600">
                {new Date(log.createdAt).toLocaleString("ko-KR")}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
