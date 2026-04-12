"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import type { OpsRunbookStepStatus } from "@/lib/types/ops-runbook";
import { getOpsRunbookExecutionSteps } from "@/lib/ops-runbooks/mock-ops-runbook-execution-steps";
import { updateOpsRunbookExecutionStep } from "@/lib/ops-runbooks/mock-ops-runbook-execution-steps";
import { setRunbookStepStatus } from "@/lib/ops-runbooks/ops-runbook-utils";
import type { OpsRunbookStepLinkedType } from "@/lib/types/ops-runbook";

const STATUS_LABELS: Record<OpsRunbookStepStatus, string> = {
  pending: "대기",
  in_progress: "진행중",
  done: "완료",
  skipped: "스킵",
  blocked: "차단",
};

const LINKED_HREF: Record<OpsRunbookStepLinkedType, (id: string) => string> = {
  incident: (id) => `/admin/recommendation-monitoring`,
  deployment: (id) => `/admin/recommendation-deployments`,
  report: (id) => `/admin/recommendation-reports/${id}`,
  checklist: () => `/admin/ops-board`,
  action_item: () => `/admin/ops-board`,
};

interface OpsRunbookStepWorkflowProps {
  executionId: string;
  executionStatus: string;
  onStepUpdate?: () => void;
}

const ADMIN_ID = "admin1";
const ADMIN_NICK = "관리자";

export function OpsRunbookStepWorkflow({
  executionId,
  executionStatus,
  onStepUpdate,
}: OpsRunbookStepWorkflowProps) {
  const [refresh, setRefresh] = useState(0);
  const steps = useMemo(
    () => getOpsRunbookExecutionSteps(executionId),
    [executionId, refresh]
  );

  const handleStatus = (
    stepId: string,
    status: "in_progress" | "done" | "skipped" | "blocked",
    note?: string
  ) => {
    setRunbookStepStatus(stepId, status, ADMIN_ID, ADMIN_NICK, note);
    setRefresh((r) => r + 1);
    onStepUpdate?.();
  };

  const pendingOrBlocked = steps.filter(
    (s) => s.status === "pending" || s.status === "blocked"
  );
  const hasBlocked = steps.some((s) => s.status === "blocked");

  if (steps.length === 0) {
    return (
      <div className="rounded-ui-rect border border-sam-border bg-sam-surface py-8 text-center text-[14px] text-sam-muted">
        실행 단계가 없습니다.
      </div>
    );
  }

  return (
    <div className="space-y-4">
      {hasBlocked && (
        <div className="rounded-ui-rect border border-red-200 bg-red-50 p-3 text-[14px] font-medium text-red-800">
          차단(blocked) 단계가 있습니다. 원인 해소 후 진행해 주세요.
        </div>
      )}
      {pendingOrBlocked.length > 0 && executionStatus === "in_progress" && (
        <div className="rounded-ui-rect border border-amber-200 bg-amber-50 p-3 text-[14px] text-amber-800">
          미완료 단계 {pendingOrBlocked.length}건
        </div>
      )}
      <ul className="space-y-3">
        {steps.map((s) => (
          <li
            key={s.id}
            className={`rounded-ui-rect border p-4 ${
              s.status === "blocked"
                ? "border-red-200 bg-red-50/50"
                : "border-sam-border bg-sam-surface"
            }`}
          >
            <div className="flex flex-wrap items-start gap-3">
              <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-sam-surface-muted text-[14px] font-medium text-sam-fg">
                {s.stepOrder}
              </span>
              <div className="min-w-0 flex-1">
                <div className="flex flex-wrap items-center gap-2">
                  <span className="font-medium text-sam-fg">{s.title}</span>
                  <span
                    className={`rounded px-2 py-0.5 text-[12px] ${
                      s.status === "done"
                        ? "bg-emerald-50 text-emerald-800"
                        : s.status === "in_progress"
                          ? "bg-amber-50 text-amber-800"
                          : s.status === "blocked"
                            ? "bg-red-100 text-red-800"
                            : "bg-sam-surface-muted text-sam-muted"
                    }`}
                  >
                    {STATUS_LABELS[s.status]}
                  </span>
                </div>
                <p className="mt-1 text-[13px] text-sam-muted">{s.description}</p>
                {(s.assignedAdminNickname || s.startedAt || s.completedAt) && (
                  <p className="mt-2 text-[12px] text-sam-muted">
                    {s.assignedAdminNickname && `담당 ${s.assignedAdminNickname}`}
                    {s.startedAt && ` · 시작 ${new Date(s.startedAt).toLocaleString("ko-KR")}`}
                    {s.completedAt && ` · 완료 ${new Date(s.completedAt).toLocaleString("ko-KR")}`}
                  </p>
                )}
                {s.note && (
                  <p className="mt-1 text-[13px] text-sam-fg">메모: {s.note}</p>
                )}
                {s.linkedType && (
                  <p className="mt-2 text-[12px]">
                    <Link
                      href={s.linkedId ? LINKED_HREF[s.linkedType](s.linkedId) : "#"}
                      className="text-signature hover:underline"
                    >
                      연결 리소스 열기 {s.linkedId ? `· ${s.linkedId}` : ""}
                    </Link>
                  </p>
                )}
              </div>
            </div>
            {executionStatus === "in_progress" &&
              (s.status === "pending" || s.status === "in_progress" || s.status === "blocked") && (
                <div className="mt-3 flex flex-wrap gap-2">
                  {s.status === "pending" && (
                    <button
                      type="button"
                      onClick={() => handleStatus(s.id, "in_progress")}
                      className="rounded border border-amber-200 bg-amber-50 px-2 py-1 text-[12px] text-amber-800"
                    >
                      시작
                    </button>
                  )}
                  {s.status === "in_progress" && (
                    <button
                      type="button"
                      onClick={() => handleStatus(s.id, "done")}
                      className="rounded border border-emerald-200 bg-emerald-50 px-2 py-1 text-[12px] text-emerald-800"
                    >
                      완료
                    </button>
                  )}
                  {(s.status === "pending" || s.status === "in_progress") && (
                    <>
                      <button
                        type="button"
                        onClick={() => handleStatus(s.id, "skipped")}
                        className="rounded border border-sam-border bg-sam-surface-muted px-2 py-1 text-[12px] text-sam-muted"
                      >
                        스킵
                      </button>
                      <button
                        type="button"
                        onClick={() => handleStatus(s.id, "blocked")}
                        className="rounded border border-red-200 bg-red-50 px-2 py-1 text-[12px] text-red-800"
                      >
                        차단
                      </button>
                    </>
                  )}
                  {s.status === "blocked" && (
                    <button
                      type="button"
                      onClick={() => handleStatus(s.id, "in_progress")}
                      className="rounded border border-amber-200 bg-amber-50 px-2 py-1 text-[12px] text-amber-800"
                    >
                      재개
                    </button>
                  )}
                </div>
              )}
          </li>
        ))}
      </ul>
    </div>
  );
}
