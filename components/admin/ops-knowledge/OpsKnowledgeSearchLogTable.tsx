"use client";

import { useMemo } from "react";
import Link from "next/link";
import { getOpsKnowledgeSearchLogs } from "@/lib/ops-knowledge/mock-ops-knowledge-search-logs";

export function OpsKnowledgeSearchLogTable() {
  const logs = useMemo(() => getOpsKnowledgeSearchLogs({ limit: 30 }), []);

  if (logs.length === 0) {
    return (
      <div className="rounded-ui-rect border border-gray-200 bg-white py-8 text-center text-[14px] text-gray-500">
        검색 로그가 없습니다.
      </div>
    );
  }

  return (
    <div className="overflow-x-auto rounded-ui-rect border border-gray-200 bg-white">
      <table className="w-full min-w-[520px] border-collapse text-[14px]">
        <thead>
          <tr className="border-b border-gray-200 bg-gray-50">
            <th className="px-3 py-2.5 text-left font-medium text-gray-700">검색어</th>
            <th className="px-3 py-2.5 text-left font-medium text-gray-700">결과 수</th>
            <th className="px-3 py-2.5 text-left font-medium text-gray-700">클릭 문서</th>
            <th className="px-3 py-2.5 text-left font-medium text-gray-700">검색자</th>
            <th className="px-3 py-2.5 text-left font-medium text-gray-700">시각</th>
          </tr>
        </thead>
        <tbody>
          {logs.map((log) => (
            <tr key={log.id} className="border-b border-gray-100 hover:bg-gray-50">
              <td className="px-3 py-2.5 font-medium text-gray-900">{log.query}</td>
              <td className="px-3 py-2.5 text-gray-700">{log.resultCount}</td>
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
              <td className="px-3 py-2.5 text-gray-600">{log.adminNickname}</td>
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
