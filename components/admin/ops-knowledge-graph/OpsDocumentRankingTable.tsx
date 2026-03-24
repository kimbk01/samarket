"use client";

import { useMemo } from "react";
import Link from "next/link";
import { getOpsKnowledgeDocumentRankings } from "@/lib/ops-knowledge-graph/mock-ops-knowledge-document-rankings";
import { getOpsDocumentById } from "@/lib/ops-docs/mock-ops-documents";

export function OpsDocumentRankingTable() {
  const rankings = useMemo(() => getOpsKnowledgeDocumentRankings(), []);

  if (rankings.length === 0) {
    return (
      <div className="rounded-lg border border-gray-200 bg-white py-8 text-center text-[14px] text-gray-500">
        랭킹 데이터가 없습니다.
      </div>
    );
  }

  return (
    <div className="overflow-x-auto rounded-lg border border-gray-200 bg-white">
      <table className="w-full min-w-[640px] border-collapse text-[14px]">
        <thead>
          <tr className="border-b border-gray-200 bg-gray-50">
            <th className="px-3 py-2.5 text-left font-medium text-gray-700">순위</th>
            <th className="px-3 py-2.5 text-left font-medium text-gray-700">문서</th>
            <th className="px-3 py-2.5 text-left font-medium text-gray-700">랭킹점수</th>
            <th className="px-3 py-2.5 text-left font-medium text-gray-700">조회</th>
            <th className="px-3 py-2.5 text-left font-medium text-gray-700">추천클릭</th>
            <th className="px-3 py-2.5 text-left font-medium text-gray-700">해결연계</th>
            <th className="px-3 py-2.5 text-left font-medium text-gray-700">실행수</th>
          </tr>
        </thead>
        <tbody>
          {rankings.map((r, idx) => {
            const doc = getOpsDocumentById(r.documentId);
            return (
              <tr key={r.id} className="border-b border-gray-100 hover:bg-gray-50">
                <td className="px-3 py-2.5 font-medium text-gray-700">{idx + 1}</td>
                <td className="px-3 py-2.5">
                  <Link
                    href={`/admin/ops-docs/${r.documentId}`}
                    className="font-medium text-signature hover:underline"
                  >
                    {doc?.title ?? r.documentId}
                  </Link>
                </td>
                <td className="px-3 py-2.5 text-gray-700">{r.rankingScore.toFixed(2)}</td>
                <td className="px-3 py-2.5 text-gray-600">{r.viewCount}</td>
                <td className="px-3 py-2.5 text-gray-600">{r.recommendationClickCount}</td>
                <td className="px-3 py-2.5 text-gray-600">{r.resolvedWithCount}</td>
                <td className="px-3 py-2.5 text-gray-600">{r.runbookExecutionCount}</td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}
