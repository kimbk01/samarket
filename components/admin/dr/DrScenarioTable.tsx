"use client";

import { useMemo, useState } from "react";
import { getDrScenarios } from "@/lib/dr/mock-dr-scenarios";
import { AdminTable } from "@/components/admin/AdminTable";
import { getScenarioTypeLabel, getDrSeverityLabel } from "@/lib/dr/dr-utils";
import type { DrScenarioType, DrSeverity } from "@/lib/types/dr";
import Link from "next/link";

export function DrScenarioTable() {
  const [typeFilter, setTypeFilter] = useState<DrScenarioType | "">("");
  const [severityFilter, setSeverityFilter] = useState<DrSeverity | "">("");

  const scenarios = useMemo(
    () =>
      getDrScenarios({
        ...(typeFilter ? { scenarioType: typeFilter } : {}),
        ...(severityFilter ? { severity: severityFilter } : {}),
      }),
    [typeFilter, severityFilter]
  );

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center gap-2">
        <span className="text-[13px] text-gray-600">시나리오 유형</span>
        <select
          value={typeFilter}
          onChange={(e) =>
            setTypeFilter((e.target.value || "") as DrScenarioType | "")
          }
          className="rounded border border-gray-200 px-3 py-1.5 text-[13px] text-gray-700"
        >
          <option value="">전체</option>
          <option value="db_down">DB 장애</option>
          <option value="api_failure">API 장애</option>
          <option value="auth_failure">인증 장애</option>
          <option value="storage_failure">스토리지 장애</option>
          <option value="chat_failure">채팅 장애</option>
          <option value="payment_failure">결제 장애</option>
        </select>
        <span className="text-[13px] text-gray-600">심각도</span>
        <select
          value={severityFilter}
          onChange={(e) =>
            setSeverityFilter((e.target.value || "") as DrSeverity | "")
          }
          className="rounded border border-gray-200 px-3 py-1.5 text-[13px] text-gray-700"
        >
          <option value="">전체</option>
          <option value="low">낮음</option>
          <option value="medium">중간</option>
          <option value="high">높음</option>
          <option value="critical">긴급</option>
        </select>
      </div>

      {scenarios.length === 0 ? (
        <div className="rounded-ui-rect border border-dashed border-gray-300 bg-gray-50/50 py-12 text-center text-[14px] text-gray-500">
          해당 조건의 시나리오가 없습니다.
        </div>
      ) : (
        <AdminTable headers={["제목", "유형", "심각도", "설명", ""]}>
          {scenarios.map((s) => (
            <tr key={s.id} className="border-b border-gray-100">
              <td className="px-3 py-2.5 font-medium text-gray-900">
                {s.title}
              </td>
              <td className="px-3 py-2.5 text-[13px] text-gray-600">
                {getScenarioTypeLabel(s.scenarioType)}
              </td>
              <td className="px-3 py-2.5">
                <span
                  className={`rounded px-1.5 py-0.5 text-[12px] ${
                    s.severity === "critical"
                      ? "bg-red-100 text-red-800"
                      : s.severity === "high"
                        ? "bg-amber-100 text-amber-800"
                        : "bg-gray-100 text-gray-600"
                  }`}
                >
                  {getDrSeverityLabel(s.severity)}
                </span>
              </td>
              <td className="max-w-[300px] px-3 py-2.5 text-[13px] text-gray-600 line-clamp-2">
                {s.description}
              </td>
              <td className="px-3 py-2.5">
                <Link
                  href={`/admin/dr/${s.id}`}
                  className="text-signature hover:underline"
                >
                  상세
                </Link>
              </td>
            </tr>
          ))}
        </AdminTable>
      )}
    </div>
  );
}
