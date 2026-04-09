"use client";

import { useMemo, useState } from "react";
import { getOpsRoutineTemplates } from "@/lib/ops-routines/mock-ops-routine-templates";
import { AdminTable } from "@/components/admin/AdminTable";
import {
  getCategoryLabel,
  getCadenceLabel,
  getPriorityLabel,
} from "@/lib/ops-routines/ops-routines-utils";
import type {
  OpsRoutineCategory,
  OpsRoutineCadence,
} from "@/lib/types/ops-routines";

export function OpsRoutineTemplateTable() {
  const [category, setCategory] = useState<OpsRoutineCategory | "">("");
  const [cadence, setCadence] = useState<OpsRoutineCadence | "">("");
  const templates = useMemo(
    () =>
      getOpsRoutineTemplates({
        ...(category ? { category: category as OpsRoutineCategory } : {}),
        ...(cadence ? { cadence: cadence as OpsRoutineCadence } : {}),
      }),
    [category, cadence]
  );

  const categories: { value: OpsRoutineCategory | ""; label: string }[] = [
    { value: "", label: "전체" },
    { value: "monitoring", label: "모니터링" },
    { value: "moderation", label: "신고/제재" },
    { value: "content", label: "콘텐츠" },
    { value: "points", label: "포인트" },
    { value: "ads", label: "광고" },
    { value: "recommendation", label: "추천" },
    { value: "docs", label: "문서" },
    { value: "automation", label: "자동화" },
    { value: "reporting", label: "보고" },
    { value: "security", label: "보안" },
  ];

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center gap-2">
        <span className="text-[13px] text-gray-600">카테고리</span>
        <select
          value={category}
          onChange={(e) =>
            setCategory((e.target.value || "") as OpsRoutineCategory | "")
          }
          className="rounded border border-gray-200 px-3 py-1.5 text-[13px] text-gray-700"
        >
          {categories.map((c) => (
            <option key={c.value || "all"} value={c.value}>
              {c.label}
            </option>
          ))}
        </select>
        <span className="text-[13px] text-gray-600">주기</span>
        <select
          value={cadence}
          onChange={(e) =>
            setCadence((e.target.value || "") as OpsRoutineCadence | "")
          }
          className="rounded border border-gray-200 px-3 py-1.5 text-[13px] text-gray-700"
        >
          <option value="">전체</option>
          <option value="weekly">주간</option>
          <option value="monthly">월간</option>
          <option value="quarterly">분기</option>
        </select>
      </div>

      {templates.length === 0 ? (
        <div className="rounded-ui-rect border border-dashed border-gray-300 bg-gray-50/50 py-12 text-center text-[14px] text-gray-500">
          해당 조건 템플릿이 없습니다.
        </div>
      ) : (
        <AdminTable
          headers={[
            "제목",
            "카테고리",
            "주기",
            "우선순위",
            "SLA(일)",
            "담당 역할",
            "활성",
          ]}
        >
          {templates.map((t) => (
            <tr key={t.id} className="border-b border-gray-100">
              <td className="px-3 py-2.5 font-medium text-gray-900">
                {t.title}
              </td>
              <td className="px-3 py-2.5 text-[13px] text-gray-700">
                {getCategoryLabel(t.category)}
              </td>
              <td className="px-3 py-2.5 text-[13px] text-gray-700">
                {getCadenceLabel(t.cadence)}
              </td>
              <td className="px-3 py-2.5 text-[13px] text-gray-700">
                {getPriorityLabel(t.defaultPriority)}
              </td>
              <td className="px-3 py-2.5 text-[13px] text-gray-500">
                {t.slaDays ?? "-"}
              </td>
              <td className="px-3 py-2.5 text-[13px] text-gray-500">
                {t.defaultOwnerRole || "-"}
              </td>
              <td className="px-3 py-2.5 text-[13px] text-gray-700">
                {t.isActive ? "Y" : "N"}
              </td>
            </tr>
          ))}
        </AdminTable>
      )}
    </div>
  );
}
