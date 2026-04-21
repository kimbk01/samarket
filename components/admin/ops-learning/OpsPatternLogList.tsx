"use client";

import { useMemo } from "react";
import { getOpsPatternLogs } from "@/lib/ops-learning/mock-ops-pattern-logs";

const ACTION_LABELS: Record<string, string> = {
  detect: "탐지",
  update: "갱신",
  link_document: "문서연결",
  create_action: "액션생성",
  mark_mitigated: "완화처리",
  close: "종료",
};

interface OpsPatternLogListProps {
  patternId: string;
}

export function OpsPatternLogList({ patternId }: OpsPatternLogListProps) {
  const logs = useMemo(() => getOpsPatternLogs(patternId), [patternId]);

  if (logs.length === 0) {
    return (
      <div>
        <p className="sam-text-helper font-medium text-sam-fg">패턴 로그</p>
        <p className="mt-1 sam-text-body-secondary text-sam-muted">로그가 없습니다.</p>
      </div>
    );
  }

  return (
    <div>
      <p className="sam-text-helper font-medium text-sam-fg">패턴 로그</p>
      <ul className="mt-2 space-y-1">
        {logs.map((log) => (
          <li
            key={log.id}
            className="flex flex-wrap items-center gap-2 rounded border border-sam-border-soft bg-sam-surface px-2 py-1.5 sam-text-body-secondary"
          >
            <span className="rounded bg-sam-surface-muted px-1.5 py-0.5 font-medium text-sam-fg">
              {ACTION_LABELS[log.actionType] ?? log.actionType}
            </span>
            <span className="text-sam-muted">{log.actorNickname}</span>
            {log.note && <span className="text-sam-muted">· {log.note}</span>}
            <span className="ml-auto text-sam-meta">
              {new Date(log.createdAt).toLocaleString("ko-KR")}
            </span>
          </li>
        ))}
      </ul>
    </div>
  );
}
