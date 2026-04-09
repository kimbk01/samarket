"use client";

import { useMemo, useState } from "react";
import { getLaunchReadinessItems } from "@/lib/launch-readiness/mock-launch-readiness-items";
import { AdminTable } from "@/components/admin/AdminTable";
import {
  getPhaseLabel,
  getGateLabel,
  getStatusLabel,
  getAreaLabel,
  getPriorityLabel,
} from "@/lib/launch-readiness/launch-readiness-utils";
import type { LaunchReadinessPhase } from "@/lib/types/launch-readiness";

export function LaunchChecklistTable() {
  const [phase, setPhase] = useState<LaunchReadinessPhase>("pre_launch");
  const items = useMemo(
    () => getLaunchReadinessItems({ phase }),
    [phase]
  );

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center gap-2">
        <span className="text-[13px] text-gray-600">단계</span>
        {(["pre_launch", "launch_day", "post_launch"] as const).map((p) => (
          <button
            key={p}
            type="button"
            onClick={() => setPhase(p)}
            className={`rounded border px-3 py-1.5 text-[13px] ${
              phase === p
                ? "border-signature bg-signature/10 text-signature"
                : "border-gray-200 bg-white text-gray-600 hover:bg-gray-50"
            }`}
          >
            {getPhaseLabel(p)}
          </button>
        ))}
      </div>

      {items.length === 0 ? (
        <div className="rounded-ui-rect border border-dashed border-gray-300 bg-gray-50/50 py-12 text-center text-[14px] text-gray-500">
          해당 단계 점검 항목이 없습니다.
        </div>
      ) : (
        <AdminTable
          headers={[
            "영역",
            "제목",
            "게이트",
            "상태",
            "우선순위",
            "담당",
            "기한",
            "차단 사유",
            "비고",
          ]}
        >
          {items.map((i) => (
            <tr
              key={i.id}
              className={`border-b border-gray-100 ${
                i.status === "blocked"
                  ? "bg-red-50/30"
                  : i.status !== "ready"
                    ? "bg-amber-50/20"
                    : ""
              }`}
            >
              <td className="px-3 py-2.5 text-[13px] text-gray-700">
                {getAreaLabel(i.area)}
              </td>
              <td className="px-3 py-2.5 font-medium text-gray-900">
                {i.title}
              </td>
              <td className="px-3 py-2.5">
                <span
                  className={`rounded px-1.5 py-0.5 text-[12px] ${
                    i.gateType === "must_have"
                      ? "bg-red-100 text-red-800"
                      : i.gateType === "should_have"
                        ? "bg-amber-100 text-amber-800"
                        : "bg-gray-100 text-gray-600"
                  }`}
                >
                  {getGateLabel(i.gateType)}
                </span>
              </td>
              <td className="px-3 py-2.5">
                <span
                  className={`rounded px-1.5 py-0.5 text-[12px] ${
                    i.status === "ready"
                      ? "bg-emerald-100 text-emerald-800"
                      : i.status === "blocked"
                        ? "bg-red-100 text-red-800"
                        : i.status === "in_progress"
                          ? "bg-blue-100 text-blue-800"
                          : "bg-gray-100 text-gray-600"
                  }`}
                >
                  {getStatusLabel(i.status)}
                </span>
              </td>
              <td className="px-3 py-2.5 text-[13px] text-gray-700">
                {getPriorityLabel(i.priority)}
              </td>
              <td className="px-3 py-2.5 text-[13px] text-gray-700">
                {i.ownerAdminNickname ?? "-"}
              </td>
              <td className="px-3 py-2.5 text-[13px] text-gray-700">
                {i.dueDate ?? "-"}
              </td>
              <td className="max-w-[160px] px-3 py-2.5 text-[13px] text-red-700">
                {i.blockerReason ?? "-"}
              </td>
              <td className="max-w-[120px] truncate px-3 py-2.5 text-[13px] text-gray-500">
                {i.note || "-"}
              </td>
            </tr>
          ))}
        </AdminTable>
      )}
    </div>
  );
}
