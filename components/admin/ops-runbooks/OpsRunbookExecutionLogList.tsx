"use client";

import { useMemo } from "react";
import { getOpsRunbookExecutionLogs } from "@/lib/ops-runbooks/mock-ops-runbook-execution-logs";

const ACTION_LABELS: Record<string, string> = {
  start_execution: "실행 시작",
  start_step: "단계 시작",
  complete_step: "단계 완료",
  skip_step: "단계 스킵",
  block_step: "단계 차단",
  add_note: "메모",
  complete_execution: "실행 완료",
  abort_execution: "실행 중단",
  write_result: "결과 기록",
};

interface OpsRunbookExecutionLogListProps {
  executionId: string;
}

export function OpsRunbookExecutionLogList({ executionId }: OpsRunbookExecutionLogListProps) {
  const logs = useMemo(
    () => getOpsRunbookExecutionLogs(executionId),
    [executionId]
  );

  if (logs.length === 0) {
    return (
      <div className="rounded-ui-rect border border-sam-border bg-sam-surface py-8 text-center text-[14px] text-sam-muted">
        실행 로그가 없습니다.
      </div>
    );
  }

  return (
    <ul className="space-y-2">
      {logs.map((log) => (
        <li
          key={log.id}
          className="flex flex-wrap items-center gap-2 rounded border border-sam-border-soft bg-sam-surface px-3 py-2 text-[13px]"
        >
          <span className="rounded bg-sam-surface-muted px-2 py-0.5 font-medium text-sam-fg">
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
  );
}
