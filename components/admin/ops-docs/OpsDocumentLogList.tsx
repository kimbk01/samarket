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
      <div className="rounded-ui-rect border border-sam-border bg-sam-surface py-8 text-center sam-text-body text-sam-muted">
        변경 이력이 없습니다.
      </div>
    );
  }

  return (
    <ul className="space-y-2">
      {logs.map((log) => (
        <li
          key={log.id}
          className="flex flex-wrap items-center gap-2 rounded border border-sam-border-soft bg-sam-surface px-3 py-2 sam-text-body-secondary"
        >
          <span className="rounded bg-sam-surface-muted px-2 py-0.5 font-medium text-sam-fg">
            {ACTION_LABELS[log.actionType] ?? log.actionType}
          </span>
          <span className="text-sam-muted">{log.actorNickname}</span>
          {log.note && (
            <span className="text-sam-muted">· {log.note}</span>
          )}
          <span className="ml-auto text-sam-meta">
            {new Date(log.createdAt).toLocaleString("ko-KR")}
          </span>
        </li>
      ))}
    </ul>
  );
}
