"use client";

import { useMemo } from "react";
import { getOpsDocumentLogs } from "@/lib/ops-docs/mock-ops-document-logs";

const ACTION_LABELS: Record<string, string> = {
  create: "생성",
  update: "수정",
  archive: "보관",
  activate: "활성화",
  duplicate: "복제",
  approve: "승인",
};

interface OpsDocumentLogListProps {
  documentId: string;
}

export function OpsDocumentLogList({ documentId }: OpsDocumentLogListProps) {
  const logs = useMemo(
    () => getOpsDocumentLogs(documentId),
    [documentId]
  );

  if (logs.length === 0) {
    return (
      <div className="rounded-ui-rect border border-gray-200 bg-white py-8 text-center text-[14px] text-gray-500">
        변경 이력이 없습니다.
      </div>
    );
  }

  return (
    <ul className="space-y-2">
      {logs.map((log) => (
        <li
          key={log.id}
          className="flex flex-wrap items-center gap-2 rounded border border-gray-100 bg-white px-3 py-2 text-[13px]"
        >
          <span className="rounded bg-gray-100 px-2 py-0.5 font-medium text-gray-700">
            {ACTION_LABELS[log.actionType] ?? log.actionType}
          </span>
          <span className="text-gray-600">{log.actorNickname}</span>
          {log.note && (
            <span className="text-gray-500">· {log.note}</span>
          )}
          <span className="ml-auto text-gray-400">
            {new Date(log.createdAt).toLocaleString("ko-KR")}
          </span>
        </li>
      ))}
    </ul>
  );
}
