"use client";

import { useMemo } from "react";
import Link from "next/link";
import { getOpsRunbookExecutions } from "@/lib/ops-runbooks/mock-ops-runbook-executions";
import type { OpsRunbookExecutionStatus, OpsRunbookLinkedType } from "@/lib/types/ops-runbook";

const STATUS_LABELS: Record<OpsRunbookExecutionStatus, string> = {
  pending: "대기",
  in_progress: "진행중",
  completed: "완료",
  aborted: "중단",
};

const LINKED_LABELS: Record<OpsRunbookLinkedType, string> = {
  incident: "이슈",
  deployment: "배포",
  rollback: "롤백",
  fallback: "Fallback",
  kill_switch: "킬스위치",
  manual: "수동",
};

const DOC_TYPE_LABELS: Record<string, string> = {
  sop: "SOP",
  playbook: "플레이북",
  scenario: "시나리오",
};

interface OpsRunbookExecutionTableProps {
  statusFilter?: OpsRunbookExecutionStatus | "";
  refresh?: number;
}

export function OpsRunbookExecutionTable({
  statusFilter = "",
  refresh = 0,
}: OpsRunbookExecutionTableProps) {
  const executions = useMemo(
    () =>
      getOpsRunbookExecutions({
        status: statusFilter || undefined,
      }),
    [statusFilter, refresh]
  );

  if (executions.length === 0) {
    return (
      <div className="rounded-ui-rect border border-sam-border bg-sam-surface py-12 text-center text-[14px] text-sam-muted">
        실행 이력이 없습니다. 문서에서 런북을 시작해 주세요.
      </div>
    );
  }

  return (
    <div className="overflow-x-auto rounded-ui-rect border border-sam-border bg-sam-surface">
      <table className="w-full min-w-[640px] border-collapse text-[14px]">
        <thead>
          <tr className="border-b border-sam-border bg-sam-app">
            <th className="px-3 py-2.5 text-left font-medium text-sam-fg">문서</th>
            <th className="px-3 py-2.5 text-left font-medium text-sam-fg">유형</th>
            <th className="px-3 py-2.5 text-left font-medium text-sam-fg">연결</th>
            <th className="px-3 py-2.5 text-left font-medium text-sam-fg">상태</th>
            <th className="px-3 py-2.5 text-left font-medium text-sam-fg">시작</th>
            <th className="px-3 py-2.5 text-left font-medium text-sam-fg">담당</th>
          </tr>
        </thead>
        <tbody>
          {executions.map((e) => (
            <tr key={e.id} className="border-b border-sam-border-soft hover:bg-sam-app">
              <td className="px-3 py-2.5">
                <Link
                  href={`/admin/ops-runbooks/${e.id}`}
                  className="font-medium text-signature hover:underline"
                >
                  {e.documentTitle}
                </Link>
              </td>
              <td className="px-3 py-2.5 text-sam-fg">
                {DOC_TYPE_LABELS[e.documentType]}
              </td>
              <td className="px-3 py-2.5 text-sam-fg">
                {LINKED_LABELS[e.linkedType]}
                {e.linkedId && ` · ${e.linkedId}`}
              </td>
              <td className="px-3 py-2.5">
                <span
                  className={`inline-block rounded px-2 py-0.5 text-[12px] ${
                    e.executionStatus === "completed"
                      ? "bg-emerald-50 text-emerald-800"
                      : e.executionStatus === "in_progress"
                        ? "bg-amber-50 text-amber-800"
                        : e.executionStatus === "aborted"
                          ? "bg-red-50 text-red-800"
                          : "bg-sam-surface-muted text-sam-muted"
                  }`}
                >
                  {STATUS_LABELS[e.executionStatus]}
                </span>
              </td>
              <td className="px-3 py-2.5 text-sam-muted">
                {new Date(e.startedAt).toLocaleString("ko-KR")}
              </td>
              <td className="px-3 py-2.5 text-sam-muted">
                {e.startedByAdminNickname}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
