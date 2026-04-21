"use client";

import { useMemo, useState } from "react";
import { getOpsRoutineExecutions } from "@/lib/ops-routines/mock-ops-routine-executions";
import { getOpsRoutineTemplateById } from "@/lib/ops-routines/mock-ops-routine-templates";
import { AdminTable } from "@/components/admin/AdminTable";
import {
  getCategoryLabel,
  getCadenceLabel,
  getExecutionStatusLabel,
  getPriorityLabel,
} from "@/lib/ops-routines/ops-routines-utils";
import type {
  OpsRoutinePeriodType,
  OpsRoutineExecutionStatus,
} from "@/lib/types/ops-routines";
import Link from "next/link";

export function OpsRoutineExecutionTable() {
  const [periodType, setPeriodType] = useState<OpsRoutinePeriodType | "">("");
  const [status, setStatus] = useState<OpsRoutineExecutionStatus | "">("");
  const executions = useMemo(
    () =>
      getOpsRoutineExecutions({
        ...(periodType ? { periodType: periodType as OpsRoutinePeriodType } : {}),
        ...(status ? { status: status as OpsRoutineExecutionStatus } : {}),
      }),
    [periodType, status]
  );

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center gap-2">
        <span className="sam-text-body-secondary text-sam-muted">주기</span>
        <select
          value={periodType}
          onChange={(e) =>
            setPeriodType((e.target.value || "") as OpsRoutinePeriodType | "")
          }
          className="rounded border border-sam-border px-3 py-1.5 sam-text-body-secondary text-sam-fg"
        >
          <option value="">전체</option>
          <option value="weekly">주간</option>
          <option value="monthly">월간</option>
          <option value="quarterly">분기</option>
        </select>
        <span className="sam-text-body-secondary text-sam-muted">상태</span>
        <select
          value={status}
          onChange={(e) =>
            setStatus((e.target.value || "") as OpsRoutineExecutionStatus | "")
          }
          className="rounded border border-sam-border px-3 py-1.5 sam-text-body-secondary text-sam-fg"
        >
          <option value="">전체</option>
          <option value="todo">할 일</option>
          <option value="in_progress">진행중</option>
          <option value="done">완료</option>
          <option value="skipped">건너뜀</option>
          <option value="overdue">지연</option>
        </select>
      </div>

      <p className="sam-text-helper text-sam-muted">
        정기 운영 업무 SLA는 dueDate 기준. 누락된 정기 업무는 overdue로 강조됩니다.
      </p>

      {executions.length === 0 ? (
        <div className="rounded-ui-rect border border-dashed border-sam-border bg-sam-app/50 py-12 text-center sam-text-body text-sam-muted">
          해당 조건 실행 항목이 없습니다.
        </div>
      ) : (
        <AdminTable
          headers={[
            "템플릿",
            "주기",
            "periodKey",
            "예정일",
            "기한",
            "상태",
            "우선순위",
            "담당",
            "이월",
            "연결",
            "비고",
          ]}
        >
          {executions.map((e) => {
            const t = getOpsRoutineTemplateById(e.templateId);
            return (
              <tr
                key={e.id}
                className={`border-b border-sam-border-soft ${
                  e.status === "overdue" ? "bg-red-50/30" : ""
                }`}
              >
                <td className="px-3 py-2.5 font-medium text-sam-fg">
                  {t?.title ?? e.templateId}
                </td>
                <td className="px-3 py-2.5 sam-text-body-secondary text-sam-fg">
                  {getCadenceLabel(e.periodType as "weekly" | "monthly" | "quarterly")}
                </td>
                <td className="px-3 py-2.5 sam-text-body-secondary text-sam-fg">
                  {e.periodKey}
                </td>
                <td className="px-3 py-2.5 sam-text-body-secondary text-sam-fg">
                  {e.scheduledDate}
                </td>
                <td className="px-3 py-2.5 sam-text-body-secondary text-sam-fg">
                  {e.dueDate ?? "-"}
                </td>
                <td className="px-3 py-2.5">
                  <span
                    className={`rounded px-1.5 py-0.5 sam-text-helper ${
                      e.status === "done"
                        ? "bg-emerald-100 text-emerald-800"
                        : e.status === "overdue"
                          ? "bg-red-100 text-red-800"
                          : "bg-amber-100 text-amber-800"
                    }`}
                  >
                    {getExecutionStatusLabel(e.status)}
                  </span>
                </td>
                <td className="px-3 py-2.5 sam-text-body-secondary text-sam-fg">
                  {getPriorityLabel(e.priority)}
                </td>
                <td className="px-3 py-2.5 sam-text-body-secondary text-sam-fg">
                  {e.ownerAdminNickname ?? "-"}
                </td>
                <td className="px-3 py-2.5 sam-text-body-secondary text-sam-fg">
                  {e.carryOverToNextPeriod ? "Y" : "-"}
                </td>
                <td className="px-3 py-2.5 sam-text-body-secondary text-sam-muted">
                  {e.linkedType && e.linkedId ? (
                    e.linkedType === "report" ? (
                      <Link
                        href="/admin/recommendation-reports"
                        className="text-signature hover:underline"
                      >
                        {e.linkedId}
                      </Link>
                    ) : e.linkedType === "maturity" ? (
                      <Link
                        href="/admin/ops-maturity"
                        className="text-signature hover:underline"
                      >
                        maturity
                      </Link>
                    ) : e.linkedType === "benchmark" ? (
                      <Link
                        href="/admin/ops-benchmarks"
                        className="text-signature hover:underline"
                      >
                        benchmark
                      </Link>
                    ) : (
                      `${e.linkedType}: ${e.linkedId}`
                    )
                  ) : (
                    "-"
                  )}
                </td>
                <td className="max-w-[140px] truncate px-3 py-2.5 sam-text-body-secondary text-sam-muted">
                  {e.note || "-"}
                </td>
              </tr>
            );
          })}
        </AdminTable>
      )}
    </div>
  );
}
