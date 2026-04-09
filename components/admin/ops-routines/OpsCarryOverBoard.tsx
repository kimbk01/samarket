"use client";

import { useMemo } from "react";
import { getCarryOverExecutions } from "@/lib/ops-routines/mock-ops-routine-executions";
import { getOpsRoutineTemplateById } from "@/lib/ops-routines/mock-ops-routine-templates";
import { getCadenceLabel, getPriorityLabel } from "@/lib/ops-routines/ops-routines-utils";
import Link from "next/link";

export function OpsCarryOverBoard() {
  const carryOver = useMemo(() => getCarryOverExecutions(), []);

  if (carryOver.length === 0) {
    return (
      <div className="rounded-ui-rect border border-dashed border-gray-300 bg-gray-50/50 py-12 text-center text-[14px] text-gray-500">
        다음 달로 이월(carry-over)된 항목이 없습니다.
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <p className="text-[13px] text-gray-600">
        carryOverToNextPeriod=true 인 항목. 다음 달 정기 업무로 반영할 수 있습니다.
      </p>
      <div className="space-y-3">
        {carryOver.map((e) => {
          const t = getOpsRoutineTemplateById(e.templateId);
          return (
            <div
              key={e.id}
              className="rounded-ui-rect border border-amber-200 bg-amber-50/50 p-4"
            >
              <div className="flex flex-wrap items-center gap-2 text-[12px] text-gray-600">
                <span>{getCadenceLabel(e.periodType as "weekly" | "monthly" | "quarterly")}</span>
                <span className="rounded bg-gray-100 px-1.5 py-0.5">
                  {getPriorityLabel(e.priority)}
                </span>
                <span>{e.periodKey}</span>
              </div>
              <p className="mt-2 font-medium text-gray-900">
                {t?.title ?? e.templateId}
              </p>
              {e.note && (
                <p className="mt-2 text-[13px] text-gray-700">{e.note}</p>
              )}
              {(e.ownerAdminNickname || e.dueDate) && (
                <p className="mt-2 text-[12px] text-gray-500">
                  담당 {e.ownerAdminNickname ?? "-"}
                  {e.dueDate && ` · 기한 ${e.dueDate}`}
                </p>
              )}
              {e.linkedType && (
                <p className="mt-1 text-[12px] text-gray-500">
                  연결: {e.linkedType}
                  {e.linkedType === "checklist" && (
                    <Link
                      href="/admin/ops-board"
                      className="ml-1 text-signature hover:underline"
                    >
                      운영 보드
                    </Link>
                  )}
                </p>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}
