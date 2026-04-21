"use client";

import { useMemo } from "react";
import Link from "next/link";
import { getOpsKnowledgeSearchLogs } from "@/lib/ops-knowledge/mock-ops-knowledge-search-logs";

export function OpsKnowledgeSearchLogTable() {
  const logs = useMemo(() => getOpsKnowledgeSearchLogs({ limit: 30 }), []);

  if (logs.length === 0) {
    return (
      <div className="rounded-ui-rect border border-sam-border bg-sam-surface py-8 text-center sam-text-body text-sam-muted">
        검색 로그가 없습니다.
      </div>
    );
  }

  return (
    <div className="overflow-x-auto rounded-ui-rect border border-sam-border bg-sam-surface">
      <table className="w-full min-w-[520px] border-collapse sam-text-body">
        <thead>
          <tr className="border-b border-sam-border bg-sam-app">
            <th className="px-3 py-2.5 text-left font-medium text-sam-fg">검색어</th>
            <th className="px-3 py-2.5 text-left font-medium text-sam-fg">결과 수</th>
            <th className="px-3 py-2.5 text-left font-medium text-sam-fg">클릭 문서</th>
            <th className="px-3 py-2.5 text-left font-medium text-sam-fg">검색자</th>
            <th className="px-3 py-2.5 text-left font-medium text-sam-fg">시각</th>
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
                {new Date(log.createdAt).toLocaleString("ko-KR")}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
