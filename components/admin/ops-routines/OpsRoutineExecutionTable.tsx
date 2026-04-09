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
        <span className="text-[13px] text-gray-600">주기</span>
        <select
          value={periodType}
          onChange={(e) =>
            setPeriodType((e.target.value || "") as OpsRoutinePeriodType | "")
          }
          className="rounded border border-gray-200 px-3 py-1.5 text-[13px] text-gray-700"
        >
          <option value="">전체</option>
          <option value="weekly">주간</option>
          <option value="monthly">월간</option>
          <option value="quarterly">분기</option>
        </select>
        <span className="text-[13px] text-gray-600">상태</span>
        <select
          value={status}
          onChange={(e) =>
            setStatus((e.target.value || "") as OpsRoutineExecutionStatus | "")
          }
          className="rounded border border-gray-200 px-3 py-1.5 text-[13px] text-gray-700"
        >
          <option value="">전체</option>
          <option value="todo">할 일</option>
          <option value="in_progress">진행중</option>
          <option value="done">완료</option>
          <option value="skipped">건너뜀</option>
          <option value="overdue">지연</option>
        </select>
      </div>

      <p className="text-[12px] text-gray-500">
        정기 운영 업무 SLA는 dueDate 기준. 누락된 정기 업무는 overdue로 강조됩니다.
      </p>

      {executions.length === 0 ? (
        <div className="rounded-ui-rect border border-dashed border-gray-300 bg-gray-50/50 py-12 text-center text-[14px] text-gray-500">
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
                className={`border-b border-gray-100 ${
                  e.status === "overdue" ? "bg-red-50/30" : ""
                }`}
              >
                <td className="px-3 py-2.5 font-medium text-gray-900">
                  {t?.title ?? e.templateId}
                </td>
                <td className="px-3 py-2.5 text-[13px] text-gray-700">
                  {getCadenceLabel(e.periodType as "weekly" | "monthly" | "quarterly")}
                </td>
                <td className="px-3 py-2.5 text-[13px] text-gray-700">
                  {e.periodKey}
                </td>
                <td className="px-3 py-2.5 text-[13px] text-gray-700">
                  {e.scheduledDate}
                </td>
                <td className="px-3 py-2.5 text-[13px] text-gray-700">
                  {e.dueDate ?? "-"}
                </td>
                <td className="px-3 py-2.5">
                  <span
                    className={`rounded px-1.5 py-0.5 text-[12px] ${
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
                <td className="px-3 py-2.5 text-[13px] text-gray-700">
                  {getPriorityLabel(e.priority)}
                </td>
                <td className="px-3 py-2.5 text-[13px] text-gray-700">
                  {e.ownerAdminNickname ?? "-"}
                </td>
                <td className="px-3 py-2.5 text-[13px] text-gray-700">
                  {e.carryOverToNextPeriod ? "Y" : "-"}
                </td>
                <td className="px-3 py-2.5 text-[13px] text-gray-500">
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
                <td className="max-w-[140px] truncate px-3 py-2.5 text-[13px] text-gray-500">
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
